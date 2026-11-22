//! Hover pill tooltip (ported from jiuci's usePillTooltip + PillTooltip).
//!
//! Anchors declare `data-pill-label` (and optionally `data-pill-href`).
//! On hover a capsule grows out from the anchor's position showing the
//! anchor's icon plus the label; clicking the pill activates the anchor.

const SHOW_DELAY_MS = 120;
const HIDE_DELAY_MS = 60;

/** Attaches pill tooltips to all matching anchors. Returns a cleanup function. */
export function setupPillTooltips(selector = "[data-pill-label]"): () => void {
	const anchors = Array.from(document.querySelectorAll<HTMLElement>(selector));
	if (anchors.length === 0) return () => {};

	let pill: HTMLElement | null = null;
	let showTimer: ReturnType<typeof setTimeout> | null = null;
	let hideTimer: ReturnType<typeof setTimeout> | null = null;

	function clearTimer(timer: ReturnType<typeof setTimeout> | null): void {
		if (timer) clearTimeout(timer);
	}

	function removePill(): void {
		pill?.remove();
		pill = null;
	}

	function scheduleHide(): void {
		clearTimer(hideTimer);
		hideTimer = setTimeout(removePill, HIDE_DELAY_MS);
	}

	function keepPill(): void {
		clearTimer(hideTimer);
	}

	function ensurePill(): HTMLElement {
		if (pill) return pill;
		const element = document.createElement("button");
		element.type = "button";
		element.className = "pill-tooltip";
		element.setAttribute("role", "tooltip");
		element.addEventListener("mouseenter", keepPill);
		element.addEventListener("mouseleave", scheduleHide);
		element.addEventListener("click", () => {
			const anchor = element.dataset.anchorId
				? document.querySelector<HTMLElement>(`[data-pill-id="${element.dataset.anchorId}"]`)
				: null;
			removePill();
			anchor?.click();
		});
		document.body.appendChild(element);
		pill = element;
		return element;
	}

	function showPill(anchor: HTMLElement): void {
		const label = anchor.dataset.pillLabel;
		if (!label) return;
		clearTimer(hideTimer);

		const element = ensurePill();
		const rect = anchor.getBoundingClientRect();
		const icon = anchor.querySelector("svg");

		element.replaceChildren();
		if (icon) {
			const iconWrap = document.createElement("span");
			iconWrap.className = "pill-tooltip-icon";
			iconWrap.appendChild(icon.cloneNode(true));
			element.appendChild(iconWrap);
		}
		const labelSpan = document.createElement("span");
		labelSpan.className = "pill-tooltip-label";
		labelSpan.textContent = label;
		element.appendChild(labelSpan);

		if (!anchor.dataset.pillId) {
			anchor.dataset.pillId = Math.random().toString(36).slice(2);
		}
		element.dataset.anchorId = anchor.dataset.pillId;

		element.style.top = `${rect.top}px`;
		element.style.left = `${rect.left}px`;
		element.style.height = `${rect.height}px`;

		element.classList.remove("is-visible");
		void element.offsetWidth;
		element.classList.add("is-visible");
	}

	function onEnter(event: MouseEvent): void {
		const anchor = event.currentTarget as HTMLElement;
		clearTimer(hideTimer);
		if (pill) {
			// A pill is already visible: reposition immediately instead of waiting.
			showPill(anchor);
			return;
		}
		clearTimer(showTimer);
		showTimer = setTimeout(() => showPill(anchor), SHOW_DELAY_MS);
	}

	function onLeave(): void {
		if (pill) {
			scheduleHide();
			return;
		}
		clearTimer(showTimer);
	}

	anchors.forEach((anchor) => {
		anchor.addEventListener("mouseenter", onEnter);
		anchor.addEventListener("mouseleave", onLeave);
	});

	window.addEventListener("scroll", removePill, { passive: true, capture: true });

	return () => {
		clearTimer(showTimer);
		clearTimer(hideTimer);
		anchors.forEach((anchor) => {
			anchor.removeEventListener("mouseenter", onEnter);
			anchor.removeEventListener("mouseleave", onLeave);
		});
		window.removeEventListener("scroll", removePill, { capture: true });
		removePill();
	};
}
