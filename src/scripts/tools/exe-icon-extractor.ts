//! Browser-side extraction of Windows PE icon resources.

type ResourceEntry = Readonly<{ id: number; offset: number; isDirectory: boolean }>;
type Section = Readonly<{ virtualAddress: number; virtualSize: number; rawAddress: number; rawSize: number }>;
type IconImage = Readonly<{ width: number; height: number; colors: number; planes: number; bitCount: number; bytes: Uint8Array }>;

const RT_ICON = 3;
const RT_GROUP_ICON = 14;

/** Installs the EXE icon extractor behavior for its page. */
export function initializeExeIconExtractor(): void {
  const root = document.querySelector<HTMLElement>("[data-exe-icon-extractor]");
  const input = root?.querySelector<HTMLInputElement>("input");
  const panel = root?.querySelector<HTMLElement>("[data-preview-panel]");
  const preview = root?.querySelector<HTMLImageElement>("[data-icon-preview]");
  const fileName = root?.querySelector<HTMLElement>("[data-file-name]");
  const status = root?.querySelector<HTMLElement>("[data-status-text]");
  const download = root?.querySelector<HTMLAnchorElement>("[data-download-link]");

  input?.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file || !panel || !preview || !fileName || !status || !download) return;
    panel.hidden = false;
    download.hidden = true;
    fileName.textContent = file.name;
    status.textContent = "正在读取资源…";
    try {
      const url = URL.createObjectURL(extractIcon(new Uint8Array(await file.arrayBuffer())));
      const previousUrl = download.getAttribute("href");
      if (previousUrl) URL.revokeObjectURL(previousUrl);
      preview.src = url;
      download.href = url;
      download.download = `${file.name.replace(/\.(exe|dll)$/i, "") || "app"}.ico`;
      download.hidden = false;
      status.textContent = "已提取图标，可直接下载。";
    } catch (error) {
      console.error(error);
      status.textContent = error instanceof Error ? error.message : "提取失败，请确认这是含图标资源的 Windows 程序。";
    }
  });
}

function extractIcon(bytes: Uint8Array): Blob {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const peOffset = u32(view, 0x3c, "不是有效的 Windows PE 文件。");
  expect(u32(view, peOffset), 0x00004550, "不是有效的 Windows PE 文件。");
  const sectionCount = u16(view, peOffset + 6, "PE 文件头不完整。");
  const optionalHeaderSize = u16(view, peOffset + 20, "PE 文件头不完整。");
  const optionalHeader = peOffset + 24;
  const magic = u16(view, optionalHeader, "PE 文件头不完整。");
  const directory = optionalHeader + (magic === 0x20b ? 112 : magic === 0x10b ? 96 : fail("不支持的 PE 格式。"));
  const resourceRva = u32(view, directory + 16, "找不到资源目录。");
  if (resourceRva === 0) throw new Error("此文件没有图标资源。");
  const sections = readSections(view, optionalHeader + optionalHeaderSize, sectionCount);
  const root = rvaToOffset(resourceRva, sections);
  const types = directoryEntries(view, root, 0);
  const group = types.find((entry) => entry.id === RT_GROUP_ICON && entry.isDirectory);
  const icons = types.find((entry) => entry.id === RT_ICON && entry.isDirectory);
  if (!group || !icons) throw new Error("此文件没有可提取的应用图标。");
  const groupData = resourceData(view, bytes, root, group.offset, sections);
  const ico = buildIco(parseGroup(groupData, (id) => resourceById(view, bytes, root, icons.offset, id, sections)));
  const blobBuffer = new ArrayBuffer(ico.byteLength);
  new Uint8Array(blobBuffer).set(ico);
  return new Blob([blobBuffer], { type: "image/x-icon" });
}

function readSections(view: DataView, offset: number, count: number): Section[] {
  return Array.from({ length: count }, (_, index) => {
    const start = offset + index * 40;
    return { virtualSize: u32(view, start + 8, "区段信息不完整。"), virtualAddress: u32(view, start + 12, "区段信息不完整。"), rawSize: u32(view, start + 16, "区段信息不完整。"), rawAddress: u32(view, start + 20, "区段信息不完整。") };
  });
}

function rvaToOffset(rva: number, sections: readonly Section[]): number {
  const section = sections.find((item) => rva >= item.virtualAddress && rva < item.virtualAddress + Math.max(item.virtualSize, item.rawSize));
  if (!section) throw new Error("资源地址无效。");
  return section.rawAddress + rva - section.virtualAddress;
}

function directoryEntries(view: DataView, root: number, offset: number): ResourceEntry[] {
  const start = root + offset;
  const count = u16(view, start + 12, "资源目录不完整。") + u16(view, start + 14, "资源目录不完整。");
  return Array.from({ length: count }, (_, index) => {
    const entry = start + 16 + index * 8;
    const name = u32(view, entry, "资源目录不完整。");
    const target = u32(view, entry + 4, "资源目录不完整。");
    return { id: name & 0x7fffffff, offset: target & 0x7fffffff, isDirectory: (target & 0x80000000) !== 0 };
  });
}

function resourceData(view: DataView, bytes: Uint8Array, root: number, typeOffset: number, sections: readonly Section[]): Uint8Array {
  const id = directoryEntries(view, root, typeOffset).find((entry) => entry.isDirectory);
  if (!id) throw new Error("图标资源目录为空。");
  return resourceLeaf(view, bytes, root, id.offset, sections);
}

function resourceById(view: DataView, bytes: Uint8Array, root: number, typeOffset: number, id: number, sections: readonly Section[]): Uint8Array {
  const entry = directoryEntries(view, root, typeOffset).find((item) => item.id === id && item.isDirectory);
  if (!entry) throw new Error("图标图层缺失。");
  return resourceLeaf(view, bytes, root, entry.offset, sections);
}

function resourceLeaf(view: DataView, bytes: Uint8Array, root: number, idOffset: number, sections: readonly Section[]): Uint8Array {
  const language = directoryEntries(view, root, idOffset).find((entry) => !entry.isDirectory);
  if (!language) throw new Error("图标资源不可用。");
  const entry = root + language.offset;
  const start = rvaToOffset(u32(view, entry, "图标资源不完整。"), sections);
  const size = u32(view, entry + 4, "图标资源不完整。");
  if (start + size > bytes.length) throw new Error("图标资源超出文件范围。");
  return bytes.slice(start, start + size);
}

function parseGroup(group: Uint8Array, getIcon: (id: number) => Uint8Array): IconImage[] {
  const view = new DataView(group.buffer, group.byteOffset, group.byteLength);
  expect(u16(view, 2, "图标组数据不完整。"), 1, "不支持的资源类型。");
  const count = u16(view, 4, "图标组数据不完整。");
  if (count === 0) throw new Error("图标组为空。");
  return Array.from({ length: count }, (_, index) => {
    const offset = 6 + index * 14;
    if (offset + 14 > group.length) throw new Error("图标组数据不完整。");
    const bytes = getIcon(u16(view, offset + 12, "图标组数据不完整。"));
    expect(bytes.length, u32(view, offset + 8, "图标组数据不完整。"), "图标图层数据不完整。");
    return { width: view.getUint8(offset), height: view.getUint8(offset + 1), colors: view.getUint8(offset + 2), planes: u16(view, offset + 4, "图标组数据不完整。"), bitCount: u16(view, offset + 6, "图标组数据不完整。"), bytes };
  });
}

function buildIco(images: readonly IconImage[]): Uint8Array {
  const directorySize = 6 + images.length * 16;
  const output = new Uint8Array(directorySize + images.reduce((total, image) => total + image.bytes.length, 0));
  const view = new DataView(output.buffer);
  view.setUint16(2, 1, true);
  view.setUint16(4, images.length, true);
  let dataOffset = directorySize;
  images.forEach((image, index) => {
    const offset = 6 + index * 16;
    view.setUint8(offset, image.width); view.setUint8(offset + 1, image.height); view.setUint8(offset + 2, image.colors);
    view.setUint16(offset + 4, image.planes, true); view.setUint16(offset + 6, image.bitCount, true);
    view.setUint32(offset + 8, image.bytes.length, true); view.setUint32(offset + 12, dataOffset, true);
    output.set(image.bytes, dataOffset); dataOffset += image.bytes.length;
  });
  return output;
}

function u16(view: DataView, offset: number, message: string): number { if (offset < 0 || offset + 2 > view.byteLength) throw new Error(message); return view.getUint16(offset, true); }
function u32(view: DataView, offset: number, message = "文件数据不完整。"): number { if (offset < 0 || offset + 4 > view.byteLength) throw new Error(message); return view.getUint32(offset, true); }
function expect(actual: number, expected: number, message: string): void { if (actual !== expected) throw new Error(message); }
function fail(message: string): never { throw new Error(message); }
