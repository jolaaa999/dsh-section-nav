window.__ModuleLoader__.load({
	id: "dsh-section-nav",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_dom_client = require("react-dom/client");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/core/adapter.ts
		/**
		* DSH chat DOM adapter.
		*
		* Every DSH-specific selector and DOM traversal lives here, mirroring the
		* original ChatGPT extension's adapter boundary. The rest of the plugin works
		* with assistant answer elements, headings, turn indexes, and stable node keys.
		*/
		/** Selectors and attributes owned by the DSH chat renderer. */
		const SELECTORS = {
			chatFlow: "[data-chat-flow]",
			assistantRow: "[data-chat-flow-kind=\"assistant-step\"]",
			heading: "h1, h2, h3",
			userRow: "[data-chat-flow-kind=\"user\"], [data-chat-flow-kind=\"steering\"]",
			thought: "[data-variant=\"think\"]"
		};
		/** Stable DOM attributes written by the DSH chat renderer. */
		const ATTRIBUTES = {
			anchorKey: "data-chat-anchor-key",
			flowKey: "data-chat-flow-key",
			flowKind: "data-chat-flow-kind",
			turn: "data-chat-turn"
		};
		function normalizePathname(pathname) {
			const normalized = pathname.split("/").filter(Boolean).map((segment) => {
				try {
					return decodeURIComponent(segment);
				} catch {
					return segment;
				}
			}).join("/");
			return normalized ? `/${normalized}` : "/";
		}
		function uniqueElements(elements) {
			return [...new Set(elements)];
		}
		function queryAttribute(attribute, value) {
			return document.querySelector(`[${attribute}="${CSS.escape(value)}"]`);
		}
		function headingsOf(message) {
			return Array.from(message.querySelectorAll(SELECTORS.heading)).filter((heading) => heading.closest(SELECTORS.thought) === null);
		}
		function hasSectionHeadings(message) {
			return headingsOf(message).length > 0;
		}
		/**
		* Create the adapter used by the trackers, parser, and bookmark recovery.
		* @param options - selected Session reader supplied by the plugin entry.
		* @returns DSH chat DOM adapter.
		*/
		function createDshAdapter(options = {}) {
			return {
				getConversationKey() {
					const sessionId = options.getSessionId?.();
					if (sessionId !== void 0 && sessionId.length > 0) return `session:${sessionId}`;
					const path = normalizePathname(window.location.pathname);
					return path === "/" ? "session:unknown" : `path:${path}`;
				},
				getConversationContainer() {
					const candidates = Array.from(document.querySelectorAll(SELECTORS.chatFlow));
					return candidates.find((candidate) => candidate.querySelector(SELECTORS.assistantRow) !== null) ?? candidates[0] ?? null;
				},
				getLayoutContainer() {
					return document.querySelector("[data-conversation-scroll]") ?? this.getConversationContainer();
				},
				getAssistantMessages() {
					const container = this.getConversationContainer() ?? document;
					return uniqueElements(Array.from(container.querySelectorAll(SELECTORS.assistantRow)).filter((element) => !element.hasAttribute("hidden") && hasSectionHeadings(element)));
				},
				getUserMessages() {
					const container = this.getConversationContainer() ?? document;
					return uniqueElements(Array.from(container.querySelectorAll(SELECTORS.userRow)).filter((element) => !element.hasAttribute("hidden")));
				},
				getMessageById(messageId) {
					const anchor = queryAttribute(ATTRIBUTES.anchorKey, messageId);
					if (anchor !== null) return anchor;
					return queryAttribute(ATTRIBUTES.flowKey, messageId);
				},
				getMessageByTurnIndex(turnIndex) {
					const rows = Array.from(document.querySelectorAll(`[${ATTRIBUTES.turn}="${String(turnIndex)}"]`)).filter((row) => row.getAttribute(ATTRIBUTES.flowKind) === "assistant-step");
					return rows.filter(hasSectionHeadings).at(-1) ?? rows.at(-1) ?? null;
				},
				getUserMessageByTurnIndex(turnIndex) {
					return Array.from(document.querySelectorAll(`[${ATTRIBUTES.turn}="${String(turnIndex)}"]`)).filter((row) => {
						const kind = row.getAttribute(ATTRIBUTES.flowKind);
						return kind === "user" || kind === "steering";
					}).at(-1) ?? null;
				},
				getAssistantMessagesByTurnIndex(turnIndex) {
					return Array.from(document.querySelectorAll(`[${ATTRIBUTES.turn}="${String(turnIndex)}"]`)).filter((row) => row.getAttribute(ATTRIBUTES.flowKind) === "assistant-step");
				},
				getReasoningElements(row) {
					return Array.from(row.querySelectorAll(SELECTORS.thought));
				},
				getMessageId(message) {
					return message.getAttribute(ATTRIBUTES.anchorKey) ?? message.getAttribute(ATTRIBUTES.flowKey) ?? null;
				},
				getMessageContent(message) {
					return message;
				},
				getHeadings(message) {
					return headingsOf(message);
				},
				getTurnIndex(message) {
					const raw = message.getAttribute(ATTRIBUTES.turn);
					if (raw === null || raw.length === 0) return null;
					const value = Number(raw);
					return Number.isInteger(value) && value >= 0 ? value : null;
				}
			};
		}
		//#endregion
		//#region src/core/constants.ts
		/** Identity used to ignore mutations produced by this plugin's own UI. */
		const EXTENSION_ROOT_ID = "dsh-section-nav-root";
		//#endregion
		//#region src/core/answerTracker.ts
		const READING_BAND_TOP_RATIO = .18;
		const READING_BAND_BOTTOM_RATIO = .78;
		const READING_LINE_RATIO$1 = .3;
		const SWITCH_THRESHOLD = .15;
		const MESSAGE_REFRESH_INTERVAL_MS = 300;
		function getIntersectionHeight(rect, top, bottom) {
			return Math.max(0, Math.min(rect.bottom, bottom) - Math.max(rect.top, top));
		}
		function getDistanceFromReadingLine(rect, viewportHeight) {
			const readingLine = viewportHeight * READING_LINE_RATIO$1;
			if (rect.bottom < readingLine) return readingLine - rect.bottom;
			if (rect.top > readingLine) return rect.top - readingLine;
			return 0;
		}
		function getAnswerScore(rect, viewportHeight) {
			const bandTop = viewportHeight * READING_BAND_TOP_RATIO;
			const bandBottom = viewportHeight * READING_BAND_BOTTOM_RATIO;
			const bandHeight = bandBottom - bandTop;
			const intersectionHeight = getIntersectionHeight(rect, bandTop, bandBottom);
			if (intersectionHeight === 0) return 0;
			const visibleRatio = intersectionHeight / Math.min(Math.max(rect.height, 1), bandHeight);
			const readingLine = viewportHeight * READING_LINE_RATIO$1;
			const readingLineBonus = rect.top <= readingLine && rect.bottom >= readingLine ? .2 : 0;
			const answerCenter = (rect.top + rect.bottom) / 2;
			const bandCenter = (bandTop + bandBottom) / 2;
			const centerBonus = Math.max(0, 1 - Math.abs(answerCenter - bandCenter) / viewportHeight) * .05;
			return visibleRatio + readingLineBonus + centerBonus;
		}
		var AnswerTracker = class {
			adapter;
			options;
			activeAnswer = null;
			animationFrameId = null;
			messageRefreshTimerId = null;
			messages = [];
			started = false;
			constructor(adapter, options) {
				this.adapter = adapter;
				this.options = options;
			}
			start() {
				if (this.started) return;
				this.started = true;
				this.refreshMessages();
				document.addEventListener("scroll", this.handleScroll, {
					capture: true,
					passive: true
				});
				window.addEventListener("resize", this.handleResize, { passive: true });
				this.scheduleEvaluation();
			}
			refreshMessages() {
				this.messages = this.adapter.getAssistantMessages();
				if (this.activeAnswer && !this.messages.includes(this.activeAnswer.element)) this.setActiveAnswer(null);
				this.scheduleEvaluation();
			}
			getActiveAnswer() {
				return this.activeAnswer;
			}
			reset() {
				this.messages = [];
				this.setActiveAnswer(null);
			}
			destroy() {
				if (!this.started) return;
				this.started = false;
				document.removeEventListener("scroll", this.handleScroll, true);
				window.removeEventListener("resize", this.handleResize);
				if (this.animationFrameId !== null) {
					window.cancelAnimationFrame(this.animationFrameId);
					this.animationFrameId = null;
				}
				if (this.messageRefreshTimerId !== null) {
					window.clearTimeout(this.messageRefreshTimerId);
					this.messageRefreshTimerId = null;
				}
				this.messages = [];
				this.setActiveAnswer(null);
			}
			handleScroll = () => {
				this.scheduleMessageRefresh();
				this.scheduleEvaluation();
			};
			handleResize = () => {
				this.scheduleEvaluation();
			};
			scheduleMessageRefresh() {
				if (this.messageRefreshTimerId !== null || !this.started) return;
				this.messageRefreshTimerId = window.setTimeout(() => {
					this.messageRefreshTimerId = null;
					this.refreshMessages();
				}, MESSAGE_REFRESH_INTERVAL_MS);
			}
			scheduleEvaluation() {
				if (this.animationFrameId !== null || !this.started) return;
				this.animationFrameId = window.requestAnimationFrame(() => {
					this.animationFrameId = null;
					this.evaluate();
				});
			}
			evaluate() {
				if (this.messages.length === 0) {
					this.setActiveAnswer(null);
					return;
				}
				const viewportHeight = window.innerHeight;
				const candidates = this.messages.map((element, index) => ({
					element,
					index,
					score: getAnswerScore(element.getBoundingClientRect(), viewportHeight)
				}));
				const bestCandidate = candidates.reduce((best, candidate) => candidate.score > best.score ? candidate : best);
				const nearestCandidate = candidates.reduce((nearest, candidate) => {
					return getDistanceFromReadingLine(candidate.element.getBoundingClientRect(), viewportHeight) < getDistanceFromReadingLine(nearest.element.getBoundingClientRect(), viewportHeight) ? candidate : nearest;
				});
				const targetCandidate = bestCandidate.score > 0 ? bestCandidate : nearestCandidate;
				if (!this.activeAnswer) {
					this.setActiveAnswer(targetCandidate);
					return;
				}
				const currentCandidate = candidates.find((candidate) => candidate.element === this.activeAnswer?.element);
				if (!currentCandidate) {
					this.setActiveAnswer(targetCandidate);
					return;
				}
				if (targetCandidate.element === currentCandidate.element) {
					this.activeAnswer = currentCandidate;
					return;
				}
				const currentHasLeftReadingBand = currentCandidate.score === 0;
				const candidateClearlyWins = targetCandidate.score > currentCandidate.score + SWITCH_THRESHOLD;
				if (targetCandidate.score > 0 && (currentHasLeftReadingBand || candidateClearlyWins)) this.setActiveAnswer(targetCandidate);
			}
			setActiveAnswer(activeAnswer) {
				const previousElement = this.activeAnswer?.element ?? null;
				this.activeAnswer = activeAnswer;
				if (previousElement !== activeAnswer?.element) this.options.onActiveAnswerChange(activeAnswer);
			}
		};
		//#endregion
		//#region src/core/text.ts
		function normalizeText(value) {
			return value.replace(/\s+/g, " ").trim();
		}
		//#endregion
		//#region src/core/hash.ts
		function hashText(value) {
			let hash = 2166136261;
			for (let index = 0; index < value.length; index += 1) {
				hash ^= value.charCodeAt(index);
				hash = Math.imul(hash, 16777619);
			}
			return (hash >>> 0).toString(36);
		}
		//#endregion
		//#region src/core/sectionParser.ts
		const ANSWER_FINGERPRINT_LENGTH = 280;
		function getHeadingLevel(heading) {
			const level = Number(heading.tagName.slice(1));
			return level === 1 || level === 2 || level === 3 ? level : null;
		}
		function getAnswerIdentity(message, adapter) {
			const messageId = adapter.getMessageId(message);
			const fingerprint = hashText(normalizeText(adapter.getMessageContent(message)?.textContent ?? "").slice(0, ANSWER_FINGERPRINT_LENGTH));
			if (messageId) return {
				fingerprint,
				key: `message:${messageId}`,
				messageId
			};
			return {
				fingerprint,
				key: `fingerprint:${fingerprint}`,
				messageId: null
			};
		}
		function getHeadingPaths(headings, minimumLevel) {
			const levelCounts = /* @__PURE__ */ new Map();
			return headings.map((heading) => {
				levelCounts.set(heading.level, (levelCounts.get(heading.level) ?? 0) + 1);
				for (let level = heading.level + 1; level <= 3; level += 1) levelCounts.delete(level);
				const pathParts = [];
				for (let level = minimumLevel; level <= heading.level; level += 1) pathParts.push(`h${level}:${levelCounts.get(level) ?? 0}`);
				return pathParts.join("/");
			});
		}
		function parseSections(message, adapter, answerIndex = -1) {
			const parsedHeadings = adapter.getHeadings(message).map((element) => ({
				element,
				level: getHeadingLevel(element),
				text: normalizeText(element.textContent ?? "")
			})).filter((heading) => heading.level !== null && heading.text.length > 0);
			if (parsedHeadings.length === 0) return [];
			const minimumLevel = Math.min(...parsedHeadings.map((heading) => heading.level));
			const answerIdentity = getAnswerIdentity(message, adapter);
			const headingPaths = getHeadingPaths(parsedHeadings, minimumLevel);
			const headingHashes = parsedHeadings.map((heading) => hashText(heading.text.toLocaleLowerCase()));
			return parsedHeadings.map((heading, index) => {
				const normalizedHeading = heading.text.toLocaleLowerCase();
				const key = `${answerIdentity.key}:heading:${index}`;
				return {
					answerFingerprint: answerIdentity.fingerprint,
					answerIndex,
					answerKey: answerIdentity.key,
					depth: heading.level - minimumLevel,
					element: heading.element,
					headingPath: headingPaths[index] ?? `heading:${index}`,
					id: `section-${hashText(key)}`,
					index,
					key,
					level: heading.level,
					messageId: answerIdentity.messageId,
					nextHeadingHash: headingHashes[index + 1] ?? null,
					previousHeadingHash: headingHashes[index - 1] ?? null,
					text: heading.text,
					textHash: headingHashes[index] ?? hashText(normalizedHeading),
					turnIndex: adapter.getTurnIndex(message)
				};
			});
		}
		//#endregion
		//#region src/core/turnParser.ts
		const MESSAGE_FINGERPRINT_LENGTH = 280;
		function messageIdentity(adapter, message, index) {
			return adapter.getMessageId(message) ?? `index:${index}`;
		}
		function userMessageText(message) {
			const bubble = message.querySelector("[class*=\"bubble\"]");
			if (bubble !== null) return normalizeText(bubble.textContent ?? "");
			const clone = message.cloneNode(true);
			for (const node of clone.querySelectorAll("[class*=\"actions\"], [class*=\"time\"]")) node.remove();
			return normalizeText(clone.textContent ?? "");
		}
		/**
		* Read the turn's final model answer.
		*
		* One turn holds several assistant-step rows because a reply streams in as
		* separate steps, so the last row with body text is what the reader saw.
		* Reasoning disclosures are dropped: without that, the excerpt would open on
		* the thinking preamble instead of the answer itself.
		* @param adapter - DSH DOM adapter.
		* @param turnIndex - turn owning the user message, or null when unnumbered.
		* @returns normalized answer text, or an empty string before the turn replies.
		*/
		function finalAnswerText(adapter, turnIndex) {
			if (turnIndex === null) return "";
			const rows = adapter.getAssistantMessagesByTurnIndex(turnIndex);
			for (let index = rows.length - 1; index >= 0; index -= 1) {
				const row = rows[index];
				if (row === void 0 || row.hasAttribute("hidden")) continue;
				const clone = (row.querySelector("[class*=\"markdown\"]") ?? row).cloneNode(true);
				for (const thought of adapter.getReasoningElements(clone)) thought.remove();
				const answer = normalizeText(clone.textContent ?? "");
				if (answer.length > 0) return answer;
			}
			return "";
		}
		/**
		* Build one directory entry for a user message.
		* @param conversationKey - stable session conversation key.
		* @param message - user message row.
		* @param index - position among user messages.
		* @param adapter - DSH DOM adapter.
		* @returns section-shaped directory entry.
		*/
		function sectionFromUserMessage(conversationKey, message, index, adapter) {
			const text = userMessageText(message);
			const messageId = adapter.getMessageId(message);
			const turnIndex = adapter.getTurnIndex(message);
			const key = `${conversationKey}:turn:${messageIdentity(adapter, message, index)}`;
			const textHash = hashText(text.toLocaleLowerCase());
			return {
				answerFingerprint: hashText(text.slice(0, MESSAGE_FINGERPRINT_LENGTH)),
				answerIndex: index,
				answerKey: messageId === null ? `index:${index}` : `message:${messageId}`,
				answerText: finalAnswerText(adapter, turnIndex),
				depth: 0,
				element: message,
				headingPath: `turn:${index}`,
				id: `section-${hashText(key)}`,
				index,
				key,
				kind: "turn",
				level: 1,
				messageId,
				nextHeadingHash: null,
				previousHeadingHash: null,
				text,
				textHash,
				turnIndex
			};
		}
		/**
		* Build the directory from every loaded user message in transcript order.
		* @param conversationKey - stable session conversation key.
		* @param adapter - DSH DOM adapter.
		* @returns one section per user message.
		*/
		function parseTurnSections(conversationKey, adapter) {
			const sections = adapter.getUserMessages().map((message, index) => sectionFromUserMessage(conversationKey, message, index, adapter));
			return sections.map((section, index) => ({
				...section,
				nextHeadingHash: sections[index + 1]?.textHash ?? null,
				previousHeadingHash: sections[index - 1]?.textHash ?? null
			}));
		}
		//#endregion
		//#region src/core/bookmarkResolver.ts
		function getBookmarkMessageId(bookmark) {
			if (bookmark.messageId) return bookmark.messageId;
			return bookmark.answerKey.startsWith("message:") ? bookmark.answerKey.slice(8) : null;
		}
		function getContextMatchCount(bookmark, section) {
			let matches = 0;
			if (bookmark.previousHeadingHash && bookmark.previousHeadingHash === section.previousHeadingHash) matches += 1;
			if (bookmark.nextHeadingHash && bookmark.nextHeadingHash === section.nextHeadingHash) matches += 1;
			return matches;
		}
		function resolveVersionTwoBookmark(bookmark, sections) {
			const indexedSection = sections[bookmark.sectionIndex];
			if (indexedSection?.level === bookmark.sectionLevel && indexedSection.textHash === bookmark.sectionTextHash) return indexedSection;
			if (indexedSection?.level === bookmark.sectionLevel && indexedSection.headingPath === bookmark.headingPath && getContextMatchCount(bookmark, indexedSection) > 0) return indexedSection;
			const textMatches = sections.filter((section) => section.level === bookmark.sectionLevel && section.textHash === bookmark.sectionTextHash);
			if (textMatches.length === 1) return textMatches[0] ?? null;
			const structuralMatches = sections.filter((section) => section.level === bookmark.sectionLevel && section.headingPath === bookmark.headingPath && getContextMatchCount(bookmark, section) > 0);
			return structuralMatches.length === 1 ? structuralMatches[0] ?? null : null;
		}
		function resolveLegacyBookmark(bookmark, sections) {
			const exactMatch = sections.find((section) => section.key === bookmark.sectionKey);
			if (exactMatch) return exactMatch;
			const normalizedBookmarkText = normalizeText(bookmark.sectionText).toLocaleLowerCase();
			const compatibleSections = sections.filter((section) => section.level === bookmark.sectionLevel && normalizeText(section.text).toLocaleLowerCase() === normalizedBookmarkText);
			const indexedMatch = compatibleSections.find((section) => section.index === bookmark.sectionIndex);
			if (indexedMatch) return indexedMatch;
			return compatibleSections.length === 1 ? compatibleSections[0] ?? null : null;
		}
		function getAnswerIndex(answer, adapter) {
			return adapter.getAssistantMessages().indexOf(answer);
		}
		function bookmarkMatchesSection(bookmark, section) {
			const bookmarkKind = bookmark.kind ?? (bookmark.locatorVersion === 3 ? "turn" : "heading");
			const sectionKind = section.kind ?? "heading";
			if (bookmarkKind === "turn" || sectionKind === "turn") {
				if (bookmarkKind !== "turn" || sectionKind !== "turn") return false;
				if (bookmark.sectionKey === section.key) return true;
				if (!(bookmark.messageId !== void 0 && bookmark.messageId === section.messageId || bookmark.turnIndex !== void 0 && bookmark.turnIndex === section.turnIndex || bookmark.answerKey === section.answerKey)) return false;
				return bookmark.sectionIndex === section.index || bookmark.sectionTextHash !== void 0 && bookmark.sectionTextHash === section.textHash;
			}
			if (bookmark.sectionKey === section.key) return true;
			if (!(bookmark.messageId !== void 0 && bookmark.messageId === section.messageId || bookmark.turnIndex !== void 0 && bookmark.turnIndex === section.turnIndex || bookmark.answerKey === section.answerKey || bookmark.answerFingerprint === section.answerFingerprint) || bookmark.sectionIndex !== section.index) return false;
			return bookmark.locatorVersion === 2 ? bookmark.sectionTextHash === section.textHash || bookmark.headingPath === section.headingPath && getContextMatchCount(bookmark, section) > 0 : bookmark.sectionLevel === section.level && normalizeText(bookmark.sectionText).toLocaleLowerCase() === normalizeText(section.text).toLocaleLowerCase();
		}
		function resolveBookmarkAnswer(bookmark, adapter) {
			if (bookmark.kind === "turn" || bookmark.locatorVersion === 3) return null;
			const messageId = getBookmarkMessageId(bookmark);
			if (messageId) {
				const message = adapter.getMessageById(messageId);
				if (message) return message;
			}
			if (bookmark.turnIndex !== void 0) {
				const message = adapter.getMessageByTurnIndex(bookmark.turnIndex);
				if (message) return message;
			}
			if (bookmark.locatorVersion === 2 && (messageId !== null || bookmark.turnIndex !== void 0)) return null;
			if (bookmark.answerFingerprint) {
				for (const [answerIndex, message] of adapter.getAssistantMessages().entries()) if (parseSections(message, adapter, answerIndex)[0]?.answerFingerprint === bookmark.answerFingerprint) return message;
			}
			return null;
		}
		function resolveTurnBookmark(bookmark, adapter) {
			const sections = parseTurnSections(bookmark.conversationKey, adapter);
			const exactMatch = sections.find((section) => bookmarkMatchesSection(bookmark, section));
			if (exactMatch) return exactMatch;
			const normalizedBookmarkText = normalizeText(bookmark.sectionText).toLocaleLowerCase();
			const compatibleSections = sections.filter((section) => normalizeText(section.text).toLocaleLowerCase() === normalizedBookmarkText);
			return compatibleSections.length === 1 ? compatibleSections[0] ?? null : null;
		}
		function resolveBookmark(bookmark, adapter) {
			if (bookmark.kind === "turn" || bookmark.locatorVersion === 3) return resolveTurnBookmark(bookmark, adapter);
			const answer = resolveBookmarkAnswer(bookmark, adapter);
			if (answer) {
				const sections = parseSections(answer, adapter, getAnswerIndex(answer, adapter));
				return bookmark.locatorVersion === 2 ? resolveVersionTwoBookmark(bookmark, sections) : resolveLegacyBookmark(bookmark, sections);
			}
			if (bookmark.locatorVersion === 2) return null;
			const allSections = adapter.getAssistantMessages().flatMap((message, answerIndex) => parseSections(message, adapter, answerIndex));
			const exactMatch = allSections.find((section) => section.key === bookmark.sectionKey);
			if (exactMatch) return exactMatch;
			const normalizedBookmarkText = normalizeText(bookmark.sectionText).toLocaleLowerCase();
			const compatibleSections = allSections.filter((section) => section.level === bookmark.sectionLevel && normalizeText(section.text).toLocaleLowerCase() === normalizedBookmarkText);
			return compatibleSections.length === 1 ? compatibleSections[0] ?? null : null;
		}
		//#endregion
		//#region src/core/scrollAnchor.ts
		function isScrollable(element) {
			const style = getComputedStyle(element);
			return /(auto|scroll|overlay)/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 1;
		}
		function getDocumentScroller() {
			return document.scrollingElement ?? document.documentElement;
		}
		function getScrollContainer(reference) {
			let current = reference;
			while (current && current !== document.body && current !== document.documentElement) {
				if (isScrollable(current)) return current;
				current = current.parentElement;
			}
			return getDocumentScroller();
		}
		function getScrollRange(scroller) {
			return Math.max(0, scroller.scrollHeight - scroller.clientHeight);
		}
		function getElementOffset(element, scroller) {
			const elementRect = element.getBoundingClientRect();
			if (scroller === getDocumentScroller()) return scroller.scrollTop + elementRect.top;
			return scroller.scrollTop + elementRect.top - scroller.getBoundingClientRect().top;
		}
		function setScrollTop(scroller, top) {
			scroller.scrollTo({
				behavior: "auto",
				top
			});
		}
		function captureScrollAnchor(element) {
			const scroller = getScrollContainer(element);
			const scrollRange = getScrollRange(scroller);
			const scrollOffset = Math.max(0, getElementOffset(element, scroller));
			return {
				scrollOffset,
				scrollRange,
				scrollRatio: scrollRange > 0 ? Math.min(1, scrollOffset / scrollRange) : 0
			};
		}
		function restoreScrollAnchor(bookmark, reference) {
			const scroller = getScrollContainer(reference);
			const currentRange = getScrollRange(scroller);
			const storedRange = bookmark.scrollRange;
			const rangeChangedSubstantially = storedRange !== void 0 && storedRange > 0 && Math.abs(currentRange - storedRange) / storedRange > .2;
			const ratioOffset = bookmark.scrollRatio === void 0 ? void 0 : bookmark.scrollRatio * currentRange;
			const preferredOffset = rangeChangedSubstantially ? ratioOffset : bookmark.scrollOffset ?? ratioOffset;
			if (preferredOffset !== void 0) setScrollTop(scroller, Math.max(0, Math.min(currentRange, preferredOffset)));
			return scroller;
		}
		function getScrollerViewportTop(scroller) {
			return scroller === getDocumentScroller() ? 0 : scroller.getBoundingClientRect().top;
		}
		function nudgeTowardTurn(bookmark, adapter, scroller, attempt) {
			if (bookmark.turnIndex === void 0) return false;
			const mountedTurns = (bookmark.kind === "turn" ? adapter.getUserMessages() : adapter.getAssistantMessages()).map((message) => ({
				message,
				turnIndex: adapter.getTurnIndex(message)
			})).filter((entry) => entry.turnIndex !== null).sort((first, second) => first.turnIndex - second.turnIndex);
			if (mountedTurns.length === 0) return false;
			const lower = [...mountedTurns].reverse().find((entry) => entry.turnIndex < (bookmark.turnIndex ?? 0));
			const upper = mountedTurns.find((entry) => entry.turnIndex > (bookmark.turnIndex ?? 0));
			const viewportCenter = getScrollerViewportTop(scroller) + scroller.clientHeight / 2;
			if (lower && upper) {
				const turnSpan = upper.turnIndex - lower.turnIndex;
				const targetRatio = (bookmark.turnIndex - lower.turnIndex) / turnSpan;
				const lowerTop = lower.message.getBoundingClientRect().top;
				const estimatedTop = lowerTop + (upper.message.getBoundingClientRect().top - lowerTop) * targetRatio;
				setScrollTop(scroller, scroller.scrollTop + estimatedTop - viewportCenter);
				return true;
			}
			const firstTurn = mountedTurns[0];
			const lastTurn = mountedTurns[mountedTurns.length - 1];
			const direction = firstTurn && bookmark.turnIndex < firstTurn.turnIndex ? -1 : lastTurn && bookmark.turnIndex > lastTurn.turnIndex ? 1 : 0;
			if (direction === 0) return false;
			const step = scroller.clientHeight * Math.min(4, 1 + attempt * .5);
			setScrollTop(scroller, scroller.scrollTop + direction * step);
			return true;
		}
		//#endregion
		//#region src/core/bookmarkRecovery.ts
		const MAX_RECOVERY_ATTEMPTS = 12;
		function waitForDomUpdate(root, timeout) {
			return new Promise((resolve) => {
				let settled = false;
				const observer = new MutationObserver(() => finish());
				const timerId = window.setTimeout(() => finish(), timeout);
				const finish = () => {
					if (settled) return;
					settled = true;
					window.clearTimeout(timerId);
					observer.disconnect();
					resolve();
				};
				observer.observe(root, {
					childList: true,
					subtree: true
				});
			});
		}
		async function recoverBookmarkTarget(bookmark, adapter, options) {
			const initialTarget = resolveBookmark(bookmark, adapter);
			if (initialTarget) return initialTarget;
			let scroller = restoreScrollAnchor(bookmark, adapter.getConversationContainer() ?? document.body);
			for (let attempt = 0; attempt < MAX_RECOVERY_ATTEMPTS; attempt += 1) {
				if (options.isCanceled()) return null;
				const answer = resolveBookmarkAnswer(bookmark, adapter);
				if (answer) {
					answer.scrollIntoView({
						behavior: "auto",
						block: "center"
					});
					scroller = getScrollContainer(answer);
				} else if (attempt > 0) nudgeTowardTurn(bookmark, adapter, scroller, attempt);
				await waitForDomUpdate(adapter.getConversationContainer() ?? document.body, Math.min(500, 180 + attempt * 35));
				if (options.isCanceled()) return null;
				const target = resolveBookmark(bookmark, adapter);
				if (target) return target;
			}
			return null;
		}
		//#endregion
		//#region src/core/bookmarkService.ts
		const STORAGE_KEY = "dshSectionNav.bookmarks.v1";
		function isBookmark(value) {
			if (!value || typeof value !== "object") return false;
			const bookmark = value;
			return typeof bookmark.id === "string" && typeof bookmark.conversationKey === "string" && (bookmark.answerIndex === void 0 || typeof bookmark.answerIndex === "number") && (bookmark.locatorVersion === void 0 || bookmark.locatorVersion === 2 || bookmark.locatorVersion === 3) && (bookmark.messageId === void 0 || typeof bookmark.messageId === "string") && (bookmark.turnIndex === void 0 || typeof bookmark.turnIndex === "number") && (bookmark.headingPath === void 0 || typeof bookmark.headingPath === "string") && (bookmark.sectionTextHash === void 0 || typeof bookmark.sectionTextHash === "string") && (bookmark.previousHeadingHash === void 0 || typeof bookmark.previousHeadingHash === "string") && (bookmark.nextHeadingHash === void 0 || typeof bookmark.nextHeadingHash === "string") && (bookmark.scrollOffset === void 0 || typeof bookmark.scrollOffset === "number") && (bookmark.scrollRange === void 0 || typeof bookmark.scrollRange === "number") && (bookmark.scrollRatio === void 0 || typeof bookmark.scrollRatio === "number") && typeof bookmark.answerKey === "string" && typeof bookmark.sectionKey === "string" && typeof bookmark.sectionText === "string" && (bookmark.sectionLevel === 1 || bookmark.sectionLevel === 2 || bookmark.sectionLevel === 3) && typeof bookmark.sectionIndex === "number" && typeof bookmark.createdAt === "number";
		}
		function applySectionLocator(bookmark, section) {
			const scrollAnchor = section.element.isConnected ? captureScrollAnchor(section.element) : {};
			return {
				...bookmark,
				answerFingerprint: section.answerFingerprint,
				answerIndex: section.answerIndex,
				answerKey: section.answerKey,
				headingPath: section.headingPath,
				kind: section.kind ?? "heading",
				locatorVersion: section.kind === "turn" ? 3 : 2,
				...section.messageId ? { messageId: section.messageId } : {},
				...section.nextHeadingHash ? { nextHeadingHash: section.nextHeadingHash } : {},
				...section.previousHeadingHash ? { previousHeadingHash: section.previousHeadingHash } : {},
				...scrollAnchor,
				sectionIndex: section.index,
				sectionKey: section.key,
				sectionLevel: section.level,
				sectionText: section.text,
				sectionTextHash: section.textHash,
				...section.turnIndex === null ? {} : { turnIndex: section.turnIndex }
			};
		}
		function createBookmark(conversationKey, section) {
			return applySectionLocator({
				answerKey: section.answerKey,
				conversationKey,
				createdAt: Date.now(),
				id: `bookmark-${hashText(`${conversationKey}:${section.key}`)}`,
				sectionIndex: section.index,
				sectionKey: section.key,
				sectionLevel: section.level,
				sectionText: section.text
			}, section);
		}
		var BookmarkService = class {
			operationQueue = Promise.resolve();
			async list(conversationKey) {
				await this.operationQueue;
				return (await this.readAll()).filter((bookmark) => bookmark.conversationKey === conversationKey).sort((first, second) => first.createdAt - second.createdAt);
			}
			toggle(conversationKey, section) {
				return this.enqueue(async () => {
					const bookmarks = await this.readAll();
					const bookmarkId = `bookmark-${hashText(`${conversationKey}:${section.key}`)}`;
					const existingIndex = bookmarks.findIndex((bookmark) => bookmark.id === bookmarkId || bookmark.sectionKey === section.key || bookmarkMatchesSection(bookmark, section));
					if (existingIndex >= 0) bookmarks.splice(existingIndex, 1);
					else bookmarks.push(createBookmark(conversationKey, section));
					await this.writeAll(bookmarks);
					return bookmarks.filter((bookmark) => bookmark.conversationKey === conversationKey);
				});
			}
			remove(conversationKey, bookmarkId) {
				return this.enqueue(async () => {
					const bookmarks = (await this.readAll()).filter((bookmark) => bookmark.id !== bookmarkId);
					await this.writeAll(bookmarks);
					return bookmarks.filter((bookmark) => bookmark.conversationKey === conversationKey);
				});
			}
			updateLocator(conversationKey, bookmarkId, section) {
				return this.enqueue(async () => {
					const bookmarks = await this.readAll();
					const bookmarkIndex = bookmarks.findIndex((bookmark) => bookmark.id === bookmarkId && bookmark.conversationKey === conversationKey);
					if (bookmarkIndex < 0) return bookmarks.filter((bookmark) => bookmark.conversationKey === conversationKey);
					const bookmark = bookmarks[bookmarkIndex];
					if (!bookmark) return bookmarks.filter((candidate) => candidate.conversationKey === conversationKey);
					bookmarks[bookmarkIndex] = applySectionLocator(bookmark, section);
					await this.writeAll(bookmarks);
					return bookmarks.filter((candidate) => candidate.conversationKey === conversationKey);
				});
			}
			enqueue(operation) {
				const result = this.operationQueue.then(operation, operation);
				this.operationQueue = result.then(() => void 0, () => void 0);
				return result;
			}
			async readAll() {
				try {
					const raw = window.localStorage.getItem(STORAGE_KEY);
					if (raw === null) return [];
					const parsed = JSON.parse(raw);
					return Array.isArray(parsed) ? parsed.filter(isBookmark) : [];
				} catch {
					return [];
				}
			}
			async writeAll(bookmarks) {
				try {
					window.localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks));
				} catch (error) {
					throw error instanceof Error ? error : new Error(String(error));
				}
			}
		};
		const bookmarkService = new BookmarkService();
		//#endregion
		//#region src/core/conversationRouteWatcher.ts
		const ROUTE_CHECK_INTERVAL_MS = 400;
		var ConversationRouteWatcher = class {
			adapter;
			options;
			currentKey;
			intervalId = null;
			started = false;
			constructor(adapter, options) {
				this.adapter = adapter;
				this.options = options;
				this.currentKey = adapter.getConversationKey();
			}
			start() {
				if (this.started) return;
				this.started = true;
				window.addEventListener("popstate", this.checkRoute);
				window.addEventListener("hashchange", this.checkRoute);
				this.intervalId = window.setInterval(this.checkRoute, ROUTE_CHECK_INTERVAL_MS);
			}
			destroy() {
				if (!this.started) return;
				this.started = false;
				window.removeEventListener("popstate", this.checkRoute);
				window.removeEventListener("hashchange", this.checkRoute);
				if (this.intervalId !== null) {
					window.clearInterval(this.intervalId);
					this.intervalId = null;
				}
			}
			sync() {
				const nextKey = this.adapter.getConversationKey();
				if (nextKey === this.currentKey) return false;
				const previousKey = this.currentKey;
				this.currentKey = nextKey;
				this.options.onRouteChange({
					currentKey: nextKey,
					previousKey
				});
				return true;
			}
			checkRoute = () => {
				this.sync();
			};
		};
		//#endregion
		//#region src/core/conversationWatcher.ts
		const MUTATION_DEBOUNCE_MS = 300;
		function isExtensionNode(node) {
			const element = node instanceof Element ? node : node.parentElement;
			return Boolean(element && (element.id === "dsh-section-nav-root" || element.closest(`#dsh-section-nav-root`)));
		}
		var ConversationWatcher = class {
			adapter;
			options;
			activeAnswer = null;
			debounceTimerId = null;
			observer = null;
			observedRoot = null;
			pendingActiveAnswerChange = false;
			pendingMessagesChange = false;
			started = false;
			constructor(adapter, options) {
				this.adapter = adapter;
				this.options = options;
			}
			start() {
				if (this.started) return;
				this.started = true;
				this.observer = new MutationObserver(this.handleMutations);
				this.refreshContainer();
			}
			setActiveAnswer(activeAnswer) {
				this.activeAnswer = activeAnswer;
			}
			refreshContainer() {
				if (!this.started || !this.observer) return;
				const nextRoot = this.adapter.getConversationContainer() ?? document.body;
				if (nextRoot === this.observedRoot) return;
				this.observer.disconnect();
				this.observedRoot = nextRoot;
				this.observer.observe(nextRoot, {
					attributeFilter: [
						"data-message-author-role",
						"data-message-id",
						"data-turn-id"
					],
					attributes: true,
					characterData: true,
					childList: true,
					subtree: true
				});
			}
			destroy() {
				if (!this.started) return;
				this.started = false;
				this.observer?.disconnect();
				this.observer = null;
				this.observedRoot = null;
				this.activeAnswer = null;
				this.pendingActiveAnswerChange = false;
				this.pendingMessagesChange = false;
				if (this.debounceTimerId !== null) {
					window.clearTimeout(this.debounceTimerId);
					this.debounceTimerId = null;
				}
			}
			handleMutations = (mutations) => {
				if (this.options.onPotentialRouteChange?.()) {
					this.pendingActiveAnswerChange = false;
					this.pendingMessagesChange = false;
					if (this.debounceTimerId !== null) {
						window.clearTimeout(this.debounceTimerId);
						this.debounceTimerId = null;
					}
					return;
				}
				for (const mutation of mutations) {
					if (isExtensionNode(mutation.target)) continue;
					if (this.activeAnswer?.contains(mutation.target)) {
						this.pendingActiveAnswerChange = true;
						continue;
					}
					if (!(mutation.type === "childList" && [...mutation.addedNodes, ...mutation.removedNodes].every(isExtensionNode))) this.pendingMessagesChange = true;
				}
				this.scheduleNotification();
			};
			scheduleNotification() {
				if (this.debounceTimerId !== null || !this.pendingActiveAnswerChange && !this.pendingMessagesChange) return;
				this.debounceTimerId = window.setTimeout(() => {
					this.debounceTimerId = null;
					const mutation = {
						activeAnswerChanged: this.pendingActiveAnswerChange,
						messagesChanged: this.pendingMessagesChange
					};
					this.pendingActiveAnswerChange = false;
					this.pendingMessagesChange = false;
					this.options.onMutation(mutation);
				}, MUTATION_DEBOUNCE_MS);
			}
		};
		//#endregion
		//#region src/core/positionManager.ts
		/** Space kept between the rail and the viewport's right edge. */
		const VIEWPORT_SAFE_AREA = 24;
		/** Clearance past the target's right edge for DSH's transcript width handle. */
		const WIDTH_HANDLE_CLEARANCE = 36;
		/** Distance kept from the viewport's right edge by an edge-pinned rail. */
		const EDGE_INSET = 10;
		/**
		* Gaps clear the right transcript width handle: its strip starts 24px past the
		* message column and is up to 10px wide, so the rail must start at least 34px
		* past the column, plus breathing room.
		*
		* Widths are ranges, not fixed widths: a wide window lets the full rail grow
		* into the free gutter instead of clipping every title at 172px.
		*/
		const FULL_MODE = {
			gap: 56,
			mode: "full",
			minWidth: 200,
			maxWidth: 420
		};
		const COMPACT_MODE = {
			gap: 44,
			mode: "compact",
			minWidth: 132,
			maxWidth: 300
		};
		const HIDDEN_RAIL_POSITION = {
			left: 0,
			mode: "hidden",
			width: 0
		};
		function positionsEqual(first, second) {
			return first.left === second.left && first.mode === second.mode && first.width === second.width;
		}
		/**
		* Narrowest rail pinned to the viewport's right edge.
		*
		* The rail never collapses into a marker strip, so a window too narrow for a
		* gutter still shows titled entries at their minimum width, clamped to what
		* the viewport can hold.
		* @param viewportWidth - Layout viewport width in CSS pixels.
		* @returns Edge-pinned compact rail position.
		*/
		function initialRailPosition(viewportWidth) {
			const width = Math.min(COMPACT_MODE.maxWidth, viewportWidth - 20);
			return {
				left: Math.max(EDGE_INSET, Math.round(viewportWidth - width - EDGE_INSET)),
				mode: "compact",
				width: Math.max(COMPACT_MODE.minWidth, width)
			};
		}
		function getPreferredModes() {
			return [FULL_MODE, COMPACT_MODE];
		}
		var PositionManager = class {
			options;
			animationFrameId = null;
			currentPosition = HIDDEN_RAIL_POSITION;
			resizeObserver = null;
			layoutObserver = null;
			started = false;
			target = null;
			layoutTarget = null;
			constructor(options) {
				this.options = options;
			}
			start() {
				if (this.started) return;
				this.started = true;
				document.addEventListener("transitionrun", this.handleLayoutChange, true);
				document.addEventListener("transitionend", this.handleLayoutChange, true);
				document.addEventListener("pointerup", this.handleLayoutChange, true);
				document.addEventListener("pointercancel", this.handleLayoutChange, true);
				window.addEventListener("resize", this.handleLayoutChange, { passive: true });
				this.resizeObserver = new ResizeObserver(this.handleLayoutChange);
				this.layoutObserver = new ResizeObserver(this.handleLayoutChange);
				this.scheduleUpdate();
			}
			/**
			* Re-evaluate the rail position on the next animation frame.
			*
			* Callers use this after a layout gesture that can move or resize the target
			* without necessarily resizing the observed element itself.
			*/
			refresh() {
				this.scheduleUpdate();
			}
			setTarget(target) {
				if (this.target === target) {
					this.scheduleUpdate();
					return;
				}
				this.resizeObserver?.disconnect();
				this.target = target;
				if (target) this.resizeObserver?.observe(target);
				this.scheduleUpdate();
			}
			/**
			* Observe a wider conversation container so rail positioning also follows
			* layout shifts that move the message column without changing its width.
			* @param target - scrollport or chat container, or null to observe nothing.
			*/
			setLayoutTarget(target) {
				if (this.layoutTarget === target) {
					this.scheduleUpdate();
					return;
				}
				this.layoutObserver?.disconnect();
				this.layoutTarget = target;
				if (target) this.layoutObserver?.observe(target);
				this.scheduleUpdate();
			}
			destroy() {
				if (!this.started) return;
				this.started = false;
				document.removeEventListener("transitionrun", this.handleLayoutChange, true);
				document.removeEventListener("transitionend", this.handleLayoutChange, true);
				document.removeEventListener("pointerup", this.handleLayoutChange, true);
				document.removeEventListener("pointercancel", this.handleLayoutChange, true);
				window.removeEventListener("resize", this.handleLayoutChange);
				this.resizeObserver?.disconnect();
				this.resizeObserver = null;
				this.layoutObserver?.disconnect();
				this.layoutObserver = null;
				this.target = null;
				this.layoutTarget = null;
				if (this.animationFrameId !== null) {
					window.cancelAnimationFrame(this.animationFrameId);
					this.animationFrameId = null;
				}
				this.updatePosition(HIDDEN_RAIL_POSITION);
			}
			handleLayoutChange = () => {
				this.scheduleUpdate();
			};
			scheduleUpdate() {
				if (!this.started || this.animationFrameId !== null) return;
				this.animationFrameId = window.requestAnimationFrame(() => {
					this.animationFrameId = null;
					this.evaluate();
				});
			}
			evaluate() {
				const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
				if (!this.target?.isConnected) {
					this.updatePosition(initialRailPosition(viewportWidth));
					return;
				}
				const targetRect = this.target.getBoundingClientRect();
				const maximumRight = viewportWidth - VIEWPORT_SAFE_AREA;
				for (const configuration of getPreferredModes()) {
					const left = Math.round(targetRect.right + configuration.gap);
					const available = maximumRight - left;
					if (available < configuration.minWidth) continue;
					this.updatePosition({
						left,
						mode: configuration.mode,
						width: Math.min(configuration.maxWidth, Math.round(available))
					});
					return;
				}
				const handleSafeLeft = Math.round(targetRect.right + WIDTH_HANDLE_CLEARANCE);
				for (const configuration of [COMPACT_MODE, FULL_MODE]) {
					const edgeLeft = Math.round(viewportWidth - configuration.maxWidth - EDGE_INSET);
					const left = Math.max(edgeLeft, handleSafeLeft);
					const available = viewportWidth - EDGE_INSET - left;
					const width = Math.min(configuration.maxWidth, available);
					if (width >= configuration.minWidth) {
						this.updatePosition({
							left,
							mode: configuration.mode,
							width
						});
						return;
					}
				}
				this.updatePosition(initialRailPosition(viewportWidth));
			}
			updatePosition(position) {
				if (positionsEqual(this.currentPosition, position)) return;
				this.currentPosition = position;
				this.options.onPositionChange(position);
			}
		};
		//#endregion
		//#region src/core/sectionNavigation.ts
		const SCROLL_MARGIN_TOP = "96px";
		const HIGHLIGHT_DURATION_MS = 1200;
		function resolveSectionElement(section, adapter) {
			if (section.messageId !== null) {
				const current = adapter.getMessageById(section.messageId);
				if (current !== null) return current;
			}
			if (section.turnIndex !== null) {
				const current = adapter.getUserMessageByTurnIndex(section.turnIndex) ?? adapter.getMessageByTurnIndex(section.turnIndex);
				if (current !== null) return current;
			}
			return section.element.isConnected ? section.element : null;
		}
		function navigateToSection(section, adapter) {
			const element = resolveSectionElement(section, adapter);
			if (element === null) return;
			const previousScrollMarginTop = element.style.scrollMarginTop;
			const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
			element.style.scrollMarginTop = SCROLL_MARGIN_TOP;
			element.scrollIntoView({
				behavior: reduceMotion ? "auto" : "smooth",
				block: "start"
			});
			if (!reduceMotion) element.animate([
				{
					backgroundColor: "transparent",
					boxShadow: "0 0 0 0 transparent"
				},
				{
					backgroundColor: "rgba(127, 127, 127, 0.12)",
					boxShadow: "0 0 0 3px rgba(127, 127, 127, 0.12)"
				},
				{
					backgroundColor: "transparent",
					boxShadow: "0 0 0 0 transparent"
				}
			], {
				duration: HIGHLIGHT_DURATION_MS,
				easing: "ease-out"
			});
			window.setTimeout(() => {
				element.style.scrollMarginTop = previousScrollMarginTop;
			}, HIGHLIGHT_DURATION_MS);
		}
		//#endregion
		//#region src/core/sectionTracker.ts
		const READING_LINE_RATIO = .3;
		var SectionTracker = class {
			options;
			activeSectionId = null;
			animationFrameId = null;
			sections = [];
			started = false;
			constructor(options) {
				this.options = options;
			}
			start() {
				if (this.started) return;
				this.started = true;
				document.addEventListener("scroll", this.handleViewportChange, {
					capture: true,
					passive: true
				});
				window.addEventListener("resize", this.handleViewportChange, { passive: true });
				this.scheduleEvaluation();
			}
			setSections(sections) {
				this.sections = sections;
				if (this.activeSectionId && !sections.some((section) => section.id === this.activeSectionId)) this.setActiveSection(null);
				this.scheduleEvaluation();
			}
			destroy() {
				if (!this.started) return;
				this.started = false;
				document.removeEventListener("scroll", this.handleViewportChange, true);
				window.removeEventListener("resize", this.handleViewportChange);
				if (this.animationFrameId !== null) {
					window.cancelAnimationFrame(this.animationFrameId);
					this.animationFrameId = null;
				}
				this.sections = [];
				this.setActiveSection(null);
			}
			handleViewportChange = () => {
				this.scheduleEvaluation();
			};
			scheduleEvaluation() {
				if (!this.started || this.animationFrameId !== null) return;
				this.animationFrameId = window.requestAnimationFrame(() => {
					this.animationFrameId = null;
					this.evaluate();
				});
			}
			evaluate() {
				if (this.sections.length === 0) {
					this.setActiveSection(null);
					return;
				}
				const readingLine = window.innerHeight * READING_LINE_RATIO;
				let activeSection = this.sections[0];
				for (const section of this.sections) if (section.element.getBoundingClientRect().top <= readingLine) activeSection = section;
				else break;
				this.setActiveSection(activeSection?.id ?? null);
			}
			setActiveSection(sectionId) {
				if (this.activeSectionId === sectionId) return;
				this.activeSectionId = sectionId;
				this.options.onActiveSectionChange(sectionId);
			}
		};
		//#endregion
		//#region src/client/components/BookmarkDrawer.tsx
		function BookmarkDrawer({ bookmarks, left, onClose, onDelete, onSelect, resolvingBookmarkIds, t, unresolvedBookmarkIds }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				"aria-labelledby": "section-nav-bookmark-drawer-title",
				className: "bookmark-drawer",
				id: "section-nav-bookmark-drawer",
				role: "dialog",
				style: {
					left: `${left}px`,
					pointerEvents: "auto"
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
					className: "bookmark-drawer-header",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "bookmark-drawer-title",
						id: "section-nav-bookmark-drawer-title",
						children: t("bookmarks")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "bookmark-drawer-subtitle",
						children: t("currentConversation", { count: bookmarks.length })
					})] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						"aria-label": t("closeBookmarks"),
						autoFocus: true,
						className: "bookmark-drawer-close",
						onClick: onClose,
						type: "button",
						children: "×"
					})]
				}), bookmarks.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "bookmark-drawer-empty",
					children: t("noBookmarks")
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
					className: "bookmark-list",
					children: bookmarks.map((bookmark) => {
						const resolving = resolvingBookmarkIds.has(bookmark.id);
						const unresolved = unresolvedBookmarkIds.has(bookmark.id);
						return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
							className: "bookmark-list-item",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								className: "bookmark-jump",
								onClick: () => onSelect(bookmark),
								title: bookmark.sectionText,
								type: "button",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									"aria-hidden": "true",
									className: "bookmark-star",
									children: "★"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: "bookmark-copy",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "bookmark-title",
										children: bookmark.sectionText
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: `bookmark-meta${unresolved ? " is-unresolved" : ""}`,
										children: resolving ? t("locating") : unresolved ? t("unavailable") : bookmark.kind === "turn" ? t("messageMeta", { index: bookmark.sectionIndex + 1 }) : t("sectionMeta", {
											level: bookmark.sectionLevel,
											index: bookmark.sectionIndex + 1
										})
									})]
								})]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								"aria-label": t("deleteBookmark", { text: bookmark.sectionText }),
								className: "bookmark-delete",
								onClick: (event) => {
									event.stopPropagation();
									onDelete(bookmark);
								},
								title: t("delete"),
								type: "button",
								children: "×"
							})]
						}, bookmark.id);
					})
				})]
			});
		}
		//#endregion
		//#region src/client/components/SectionRailItem.tsx
		function SectionRailItem({ active, bookmarked, onSelect, onToggleBookmark, section, t }) {
			const buttonRef = (0, react.useRef)(null);
			const label = section.text.length > 0 ? section.text : t("messageMeta", { index: section.index + 1 });
			const answerText = (section.answerText ?? "").slice(0, 120);
			const depthStyle = { "--section-depth": section.depth };
			const [cardTop, setCardTop] = (0, react.useState)(null);
			const showCard = () => {
				const rect = buttonRef.current?.getBoundingClientRect();
				if (rect === void 0) return;
				setCardTop(rect.top + rect.height / 2);
			};
			const hideCard = () => {
				setCardTop(null);
			};
			(0, react.useEffect)(() => {
				if (active) buttonRef.current?.scrollIntoView({
					block: "nearest",
					inline: "nearest"
				});
			}, [active]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
				className: "section-rail-list-item",
				onMouseEnter: showCard,
				onMouseLeave: hideCard,
				style: depthStyle,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						"aria-current": active ? "location" : void 0,
						"aria-label": t("jumpToSection", { text: label }),
						className: `section-rail-item${active ? " is-active" : ""}`,
						onBlur: hideCard,
						onClick: () => onSelect(section),
						onFocus: showCard,
						ref: buttonRef,
						type: "button",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							"aria-hidden": "true",
							className: "section-rail-marker"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "section-rail-text",
							children: label
						})]
					}),
					cardTop === null ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						"aria-hidden": "true",
						className: "section-tooltip",
						style: { top: `${cardTop}px` },
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "section-tooltip-prompt",
							children: label
						}), answerText.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "section-tooltip-response",
							children: answerText
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						"aria-label": t(bookmarked ? "unbookmarkSection" : "bookmarkSection", { text: label }),
						"aria-pressed": bookmarked,
						className: `section-bookmark-toggle${bookmarked ? " is-bookmarked" : ""}`,
						onClick: (event) => {
							event.stopPropagation();
							onToggleBookmark(section);
						},
						title: t(bookmarked ? "unbookmark" : "bookmark"),
						type: "button",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							"aria-hidden": "true",
							children: bookmarked ? "★" : "☆"
						})
					})
				]
			});
		}
		//#endregion
		//#region src/client/components/SectionRail.tsx
		function SectionRail({ activeSectionId, bookmarkedSectionKeys, bookmarkCount, drawerOpen, onSectionSelect, onToggleBookmark, onToggleDrawer, position, sections, t }) {
			const listRef = (0, react.useRef)(null);
			const followTailRef = (0, react.useRef)(true);
			const lastSectionId = sections.at(-1)?.id ?? null;
			(0, react.useEffect)(() => {
				const list = listRef.current;
				if (list === null) return;
				const handleScroll = () => {
					followTailRef.current = list.scrollHeight - list.scrollTop - list.clientHeight <= 24;
				};
				list.addEventListener("scroll", handleScroll, { passive: true });
				return () => list.removeEventListener("scroll", handleScroll);
			}, []);
			(0, react.useEffect)(() => {
				const list = listRef.current;
				if (list === null || !followTailRef.current) return;
				list.scrollTop = list.scrollHeight;
			}, [
				lastSectionId,
				sections.length,
				position.mode,
				position.width,
				position.left
			]);
			if (position.mode === "hidden") return null;
			const turnMode = sections.length > 0 && sections.every((section) => section.kind === "turn");
			const groups = [];
			if (!turnMode) for (const section of sections) {
				const last = groups.at(-1);
				if (last !== void 0 && last.key === section.answerKey) last.sections.push(section);
				else groups.push({
					key: section.answerKey,
					sections: [section]
				});
			}
			const currentGroupKey = activeSectionId !== null ? sections.find((section) => section.id === activeSectionId)?.answerKey ?? groups.at(-1)?.key : groups.at(-1)?.key;
			let historyIndex = 0;
			const renderItem = (section) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SectionRailItem, {
				active: section.id === activeSectionId,
				bookmarked: bookmarkedSectionKeys.has(section.key),
				onSelect: onSectionSelect,
				onToggleBookmark,
				section,
				t
			}, section.id);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("nav", {
				"aria-label": t("sections"),
				className: `section-rail is-${position.mode}`,
				"data-mode": position.mode,
				style: {
					"--section-rail-left": `${position.left}px`,
					left: `${position.left}px`,
					width: `${position.width}px`
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "section-rail-heading",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "section-rail-heading-text",
						children: t("sections")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						"aria-controls": "section-nav-bookmark-drawer",
						"aria-expanded": drawerOpen,
						"aria-label": t("bookmarkOpen", { count: bookmarkCount }),
						className: "bookmark-drawer-trigger",
						onClick: onToggleDrawer,
						title: t("bookmarkTitle", { count: bookmarkCount }),
						type: "button",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							"aria-hidden": "true",
							children: bookmarkCount > 0 ? "★" : "☆"
						}), bookmarkCount > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: bookmarkCount }) : null]
					})]
				}), sections.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "section-rail-empty",
					children: t("emptySections")
				}) : turnMode ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ol", {
					className: "section-rail-list",
					ref: listRef,
					children: sections.map(renderItem)
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ol", {
					className: "section-rail-list",
					ref: listRef,
					children: groups.map((group) => {
						const isCurrent = group.key === currentGroupKey;
						if (!isCurrent) historyIndex += 1;
						return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
							className: "section-rail-group",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "section-rail-group-label",
								children: isCurrent ? t("currentAnswer") : t("historyAnswer", { index: historyIndex })
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ol", {
								className: "section-rail-group-list",
								children: group.sections.map(renderItem)
							})]
						}, group.key);
					})
				})]
			});
		}
		//#endregion
		//#region src/client/components/App.tsx
		function App({ activeSectionId, bookmarks, drawerOpen, onBookmarkDelete, onBookmarkSelect, onDrawerClose, onDrawerToggle, onSectionSelect, onToggleBookmark, position, resolvingBookmarkIds, sections, t, unresolvedBookmarkIds }) {
			const bookmarkedSectionKeys = new Set(sections.filter((section) => bookmarks.some((bookmark) => bookmarkMatchesSection(bookmark, section))).map((section) => section.key));
			const drawerLeft = Math.max(12, position.left - 312);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SectionRail, {
				activeSectionId,
				bookmarkedSectionKeys,
				bookmarkCount: bookmarks.length,
				drawerOpen,
				onSectionSelect,
				onToggleBookmark,
				onToggleDrawer: onDrawerToggle,
				position,
				sections,
				t
			}), drawerOpen && position.mode !== "hidden" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(BookmarkDrawer, {
				bookmarks,
				left: drawerLeft,
				onClose: onDrawerClose,
				onDelete: onBookmarkDelete,
				onSelect: onBookmarkSelect,
				resolvingBookmarkIds,
				t,
				unresolvedBookmarkIds
			}) : null] });
		}
		//#endregion
		//#region src/client/extensionRoot.ts
		/**
		* Create or reuse the isolated host element that contains the section rail.
		* @returns Open shadow root owned by this plugin.
		*/
		function getOrCreateExtensionRoot() {
			const existingHost = document.getElementById(EXTENSION_ROOT_ID);
			if (existingHost instanceof HTMLElement) {
				applyHostShell(existingHost);
				return existingHost.shadowRoot ?? existingHost.attachShadow({ mode: "open" });
			}
			const host = document.createElement("div");
			host.id = EXTENSION_ROOT_ID;
			host.dataset.extension = "dsh-section-nav";
			applyHostShell(host);
			document.body.append(host);
			return host.attachShadow({ mode: "open" });
		}
		/**
		* Keep the host outside document layout and let only the rail/drawer receive
		* pointer input. A body-level block host could otherwise change body layout
		* while a fixed overlay with the whole viewport would intercept every click.
		* @param host - plugin host element.
		*/
		function applyHostShell(host) {
			host.style.position = "fixed";
			host.style.inset = "0";
			host.style.pointerEvents = "none";
			host.style.zIndex = "2147483000";
		}
		//#endregion
		//#region src/client/locales.ts
		/** Locale namespace and copy for the section navigation rail. */
		/** Namespace registered with `ctx.locale`. */
		const NS = "dshSectionNav";
		/** Chinese copy, matching the original Section Nav wording. */
		const zh = {
			sections: "目录",
			currentAnswer: "当前回答",
			historyAnswer: "历史回答 {index}",
			bookmarkOpen: "打开书签列表，共 {count} 项",
			bookmarkTitle: "书签（{count}）",
			emptySections: "当前会话还没有可导航的消息",
			jumpToSection: "跳转到消息：{text}",
			bookmarkSection: "收藏消息：{text}",
			unbookmarkSection: "取消收藏消息：{text}",
			bookmark: "收藏消息",
			unbookmark: "取消收藏",
			bookmarks: "书签",
			currentConversation: "当前对话 · {count}",
			closeBookmarks: "关闭书签列表",
			noBookmarks: "尚未收藏消息",
			locating: "正在定位…",
			unavailable: "目标暂不可用",
			deleteBookmark: "删除书签：{text}",
			delete: "删除书签",
			messageMeta: "第 {index} 条消息",
			sectionMeta: "H{level} · Section {index}"
		};
		/** English copy, matching the original Section Nav wording. */
		const en = {
			sections: "Sections",
			currentAnswer: "Current answer",
			historyAnswer: "History answer {index}",
			bookmarkOpen: "Open bookmarks, {count} total",
			bookmarkTitle: "Bookmarks ({count})",
			emptySections: "No navigable messages in this conversation yet",
			jumpToSection: "Jump to message: {text}",
			bookmarkSection: "Bookmark message: {text}",
			unbookmarkSection: "Remove bookmark from message: {text}",
			bookmark: "Bookmark message",
			unbookmark: "Remove bookmark",
			bookmarks: "Bookmarks",
			currentConversation: "Current conversation · {count}",
			closeBookmarks: "Close bookmark list",
			noBookmarks: "No bookmarked messages yet",
			locating: "Locating…",
			unavailable: "Target unavailable",
			deleteBookmark: "Delete bookmark: {text}",
			delete: "Delete bookmark",
			messageMeta: "Message {index}",
			sectionMeta: "H{level} · Section {index}"
		};
		/** Minimal fallback used when the locale service is unavailable. */
		function fallbackTranslate(key, params) {
			const text = en[key] ?? key;
			if (params === void 0) return text;
			return text.replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? `{${name}}`));
		}
		//#endregion
		//#region src/client/styles.ts
		/** Styles copied from Section-Nav-for-ChatGPT (MIT), scoped by the plugin shadow root. */
		const extensionCss = ":host {\n  color-scheme: light dark;\n  font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif;\n  --ext-page-text: CanvasText;\n  --ext-page-background: Canvas;\n  --ext-text-primary: var(--ext-page-text);\n  --ext-text-secondary: color-mix(in srgb, var(--ext-page-text) 52%, transparent);\n  --ext-marker: color-mix(in srgb, var(--ext-page-text) 30%, transparent);\n  --ext-hover: color-mix(in srgb, var(--ext-page-text) 7%, transparent);\n  --ext-focus: color-mix(in srgb, var(--ext-page-text) 35%, transparent);\n}\n\n* {\n  box-sizing: border-box;\n}\n\n.section-rail {\n  position: fixed;\n  top: 80px;\n  bottom: 120px;\n  z-index: 2147483000;\n  color: var(--ext-text-secondary);\n  pointer-events: auto;\n  transition: color 160ms ease, left 160ms ease, width 160ms ease;\n}\n\n.section-rail-heading {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  margin: 0 0 10px 20px;\n  color: var(--ext-text-secondary);\n  font-size: 11px;\n  font-weight: 500;\n  letter-spacing: 0.02em;\n  opacity: 0.72;\n}\n\n.bookmark-drawer-trigger,\n.section-bookmark-toggle,\n.bookmark-drawer-close,\n.bookmark-delete {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  border: 0;\n  background: transparent;\n  color: inherit;\n  font: inherit;\n  cursor: pointer;\n}\n\n.bookmark-drawer-trigger {\n  gap: 3px;\n  min-width: 28px;\n  height: 28px;\n  padding: 0 5px;\n  border-radius: 7px;\n  font-size: 11px;\n}\n\n.bookmark-drawer-trigger:hover,\n.bookmark-drawer-trigger:focus-visible {\n  background: var(--ext-hover);\n  color: var(--ext-text-primary);\n}\n\n.section-rail-list {\n  max-height: 100%;\n  margin: 0;\n  padding: 0 3px 0 0;\n  overflow-y: auto;\n  scrollbar-color: color-mix(in srgb, CanvasText 14%, transparent) transparent;\n  scrollbar-width: thin;\n  list-style: none;\n}\n\n.section-rail-list-item {\n  position: relative;\n  margin: 0;\n  padding: 0;\n}\n\n.section-rail-item {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  width: 100%;\n  min-height: 34px;\n  padding-block: 6px;\n  padding-inline-start: calc(var(--section-depth, 0) * 11px);\n  padding-inline-end: 28px;\n  border: 0;\n  border-radius: 6px;\n  background: transparent;\n  color: inherit;\n  font: inherit;\n  text-align: start;\n  cursor: pointer;\n  opacity: 0.72;\n  transition: color 140ms ease, opacity 140ms ease, background-color 140ms ease;\n}\n\n.section-bookmark-toggle {\n  position: absolute;\n  top: 50%;\n  right: 3px;\n  width: 26px;\n  height: 26px;\n  border-radius: 6px;\n  color: var(--ext-text-secondary);\n  font-size: 13px;\n  opacity: 0;\n  transform: translateY(-50%);\n  transition: color 140ms ease, opacity 140ms ease, background-color 140ms ease;\n}\n\n.section-rail-list-item:hover .section-bookmark-toggle,\n.section-rail-list-item:focus-within .section-bookmark-toggle,\n.section-bookmark-toggle.is-bookmarked {\n  opacity: 1;\n}\n\n.section-bookmark-toggle:hover,\n.section-bookmark-toggle:focus-visible,\n.section-bookmark-toggle.is-bookmarked {\n  color: var(--ext-text-primary);\n}\n\n.section-bookmark-toggle:hover,\n.section-bookmark-toggle:focus-visible {\n  background: var(--ext-hover);\n}\n\n.section-rail-item:hover {\n  background: var(--ext-hover);\n  color: var(--ext-text-primary);\n  opacity: 0.9;\n}\n\n.section-rail-item:focus-visible {\n  outline: 1px solid var(--ext-focus);\n  outline-offset: 1px;\n}\n\n.section-rail-item.is-active {\n  color: var(--ext-text-primary);\n  font-weight: 500;\n  opacity: 1;\n}\n\n.section-rail-marker {\n  flex: 0 0 auto;\n  width: 9px;\n  height: 2px;\n  border-radius: 999px;\n  background: var(--ext-marker);\n  transition: width 140ms ease, height 140ms ease, background-color 140ms ease;\n}\n\n.section-rail-item.is-active .section-rail-marker {\n  width: 7px;\n  height: 7px;\n  background: currentColor;\n}\n\n.section-rail-text {\n  min-width: 0;\n  overflow: hidden;\n  font-size: 12px;\n  line-height: 1.4;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.section-rail-empty {\n  margin-left: 20px;\n  font-size: 11px;\n  line-height: 1.45;\n  opacity: 0.55;\n}\n\n.section-rail.is-compact .section-rail-heading {\n  margin-left: 18px;\n}\n\n.section-rail.is-compact .section-rail-item {\n  gap: 6px;\n  min-height: 32px;\n  padding-inline-start: calc(var(--section-depth, 0) * 8px);\n}\n\n.section-rail.is-compact .section-rail-text {\n  font-size: 11px;\n}\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n.bookmark-drawer {\n  position: fixed;\n  top: 80px;\n  z-index: 2147483001;\n  width: 330px;\n  max-height: min(560px, calc(100vh - 200px));\n  overflow: hidden;\n  border: 1px solid color-mix(in srgb, var(--ext-page-text) 13%, transparent);\n  border-radius: 14px;\n  background: color-mix(in srgb, var(--ext-page-background) 96%, transparent);\n  box-shadow: 0 14px 40px color-mix(in srgb, var(--ext-page-text) 14%, transparent);\n  color: var(--ext-text-primary);\n  backdrop-filter: blur(16px);\n  transition: background-color 160ms ease, border-color 160ms ease, color 160ms ease;\n}\n\n.bookmark-drawer-header {\n  display: flex;\n  align-items: flex-start;\n  justify-content: space-between;\n  padding: 14px 14px 11px;\n  border-bottom: 1px solid color-mix(in srgb, CanvasText 9%, transparent);\n}\n\n.bookmark-drawer-title {\n  font-size: 14px;\n  font-weight: 600;\n}\n\n.bookmark-drawer-subtitle {\n  margin-top: 2px;\n  color: var(--ext-text-secondary);\n  font-size: 11px;\n}\n\n.bookmark-drawer-close {\n  width: 26px;\n  height: 26px;\n  border-radius: 6px;\n  font-size: 19px;\n  line-height: 1;\n}\n\n.bookmark-drawer-close:hover,\n.bookmark-drawer-close:focus-visible,\n.bookmark-delete:hover,\n.bookmark-delete:focus-visible {\n  background: var(--ext-hover);\n}\n\n.bookmark-drawer-empty {\n  padding: 28px 14px;\n  color: var(--ext-text-secondary);\n  font-size: 12px;\n  text-align: center;\n}\n\n.bookmark-list {\n  max-height: calc(min(560px, 100vh - 200px) - 62px);\n  margin: 0;\n  padding: 6px;\n  overflow-y: auto;\n  scrollbar-color: color-mix(in srgb, CanvasText 14%, transparent) transparent;\n  scrollbar-width: thin;\n  list-style: none;\n}\n\n.bookmark-list-item {\n  position: relative;\n  display: flex;\n  align-items: center;\n  border-radius: 8px;\n}\n\n.bookmark-list-item:hover {\n  background: var(--ext-hover);\n}\n\n.bookmark-jump {\n  display: flex;\n  align-items: flex-start;\n  gap: 9px;\n  min-width: 0;\n  flex: 1;\n  padding: 9px 34px 9px 8px;\n  border: 0;\n  background: transparent;\n  color: inherit;\n  font: inherit;\n  text-align: start;\n  cursor: pointer;\n}\n\n.bookmark-star {\n  flex: 0 0 auto;\n  margin-top: 1px;\n  font-size: 12px;\n}\n\n.bookmark-copy {\n  display: grid;\n  min-width: 0;\n  gap: 2px;\n}\n\n.bookmark-title {\n  overflow: hidden;\n  font-size: 12px;\n  font-weight: 500;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.bookmark-meta {\n  color: var(--ext-text-secondary);\n  font-size: 10px;\n}\n\n.bookmark-meta.is-unresolved {\n  font-style: italic;\n}\n\n.bookmark-delete {\n  position: absolute;\n  right: 6px;\n  width: 24px;\n  height: 24px;\n  border-radius: 5px;\n  color: var(--ext-text-secondary);\n  font-size: 15px;\n  opacity: 0;\n}\n\n.bookmark-list-item:hover .bookmark-delete,\n.bookmark-list-item:focus-within .bookmark-delete {\n  opacity: 1;\n}\n\n@media (prefers-reduced-motion: reduce) {\n  .section-rail-item,\n  .section-rail-marker,\n  .section-rail {\n    transition: none;\n  }\n}\n\n@media (forced-colors: active) {\n  .section-rail-item:focus-visible,\n  .bookmark-drawer-trigger:focus-visible,\n  .section-bookmark-toggle:focus-visible,\n  .bookmark-jump:focus-visible,\n  .bookmark-delete:focus-visible,\n  .bookmark-drawer-close:focus-visible {\n    outline: 2px solid Highlight;\n    outline-offset: 1px;\n  }\n\n  .section-rail-marker,\n  .section-rail-item.is-active .section-rail-marker {\n    background: ButtonText;\n  }\n\n  .bookmark-drawer {\n    border-color: ButtonText;\n    background: Canvas;\n  }\n}\n\n\n.section-rail-group {\n  margin: 0;\n  padding: 0;\n  list-style: none;\n}\n\n.section-rail-group + .section-rail-group {\n  margin-top: 8px;\n  padding-top: 8px;\n  border-top: 1px solid color-mix(in srgb, var(--ext-page-text) 8%, transparent);\n}\n\n.section-rail-group-label {\n  margin: 0 0 4px 20px;\n  color: var(--ext-text-secondary);\n  font-size: 10px;\n  font-weight: 500;\n  letter-spacing: 0.02em;\n  opacity: 0.68;\n}\n\n.section-rail-group-list {\n  margin: 0;\n  padding: 0;\n  list-style: none;\n}\n\n.section-rail.is-compact .section-rail-group-label {\n  margin-left: 18px;\n  font-size: 10px;\n}\n\n/* Hover card. Colors and type come from DSH's semantic tokens so it follows\n   the host theme; each token carries a fallback for non-DSH embedding.\n   Fixed positioning is required: the rail list scrolls, and an absolute card\n   would be clipped by that scrollport. */\n.section-tooltip {\n  position: fixed;\n  right: calc(100vw - var(--section-rail-left, 100vw) + 10px);\n  z-index: 2147483002;\n  display: block;\n  width: max-content;\n  max-width: 280px;\n  padding: 9px 11px;\n  border: 0;\n  border-radius: 10px;\n  color: var(--dsw-alias-label-primary, var(--ext-text-primary));\n  background: var(--dsw-alias-bg-layer-1, var(--ext-page-background));\n  box-shadow: 0 0 0 0.5px color-mix(in srgb, var(--ext-page-text) 14%, transparent), 0 4px 16px color-mix(in srgb, var(--ext-page-text) 12%, transparent);\n  transform: translateY(-50%);\n  pointer-events: none;\n  animation: dsh-section-tooltip-in 140ms ease-out;\n}\n\n.section-tooltip-prompt,\n.section-tooltip-response {\n  display: -webkit-box;\n  overflow: hidden;\n  -webkit-box-orient: vertical;\n}\n\n/* The reader's request, clamped to one line. */\n.section-tooltip-prompt {\n  font: var(--dsw-font-xs-strong-13, 500 13px/20px inherit);\n  -webkit-line-clamp: 1;\n}\n\n/* The turn's final answer, clamped to two lines. */\n.section-tooltip-response {\n  margin-top: 3px;\n  color: var(--dsw-alias-label-caption, var(--ext-text-secondary));\n  font: var(--dsw-font-xxs-12, 12px/18px inherit);\n  -webkit-line-clamp: 2;\n}\n\n@keyframes dsh-section-tooltip-in {\n  from { opacity: 0; }\n  to { opacity: 1; }\n}\n\n@media (prefers-reduced-motion: reduce) {\n  .section-tooltip { animation: none; }\n}\n";
		//#endregion
		//#region src/client/themeManager.ts
		const THEME_ATTRIBUTES = [
			"class",
			"style",
			"data-theme",
			"data-color-scheme"
		];
		const TRANSPARENT_COLORS = /* @__PURE__ */ new Set(["transparent", "rgba(0, 0, 0, 0)"]);
		function parseRgb(color) {
			const match = color.match(/rgba?\(\s*(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)/);
			if (!match?.[1] || !match[2] || !match[3]) return null;
			return [
				Number(match[1]),
				Number(match[2]),
				Number(match[3])
			];
		}
		function getRelativeLuminance(color) {
			const rgb = parseRgb(color);
			if (!rgb) return null;
			const channels = rgb.map((channel) => {
				const normalized = channel / 255;
				return normalized <= .04045 ? normalized / 12.92 : ((normalized + .055) / 1.055) ** 2.4;
			});
			return .2126 * (channels[0] ?? 0) + .7152 * (channels[1] ?? 0) + .0722 * (channels[2] ?? 0);
		}
		function getPageBackground() {
			const bodyBackground = getComputedStyle(document.body).backgroundColor;
			if (!TRANSPARENT_COLORS.has(bodyBackground)) return bodyBackground;
			const rootBackground = getComputedStyle(document.documentElement).backgroundColor;
			if (!TRANSPARENT_COLORS.has(rootBackground)) return rootBackground;
			return window.matchMedia("(prefers-color-scheme: dark)").matches ? "rgb(33, 33, 33)" : "rgb(255, 255, 255)";
		}
		var ThemeManager = class {
			host;
			animationFrameId = null;
			bodyObserver = null;
			observedBody = null;
			rootObserver = null;
			started = false;
			systemThemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
			constructor(host) {
				this.host = host;
			}
			start() {
				if (this.started) return;
				this.started = true;
				this.rootObserver = new MutationObserver(this.handleRootMutation);
				this.bodyObserver = new MutationObserver(this.scheduleUpdate);
				this.rootObserver.observe(document.documentElement, {
					attributeFilter: THEME_ATTRIBUTES,
					attributes: true,
					childList: true
				});
				this.observeBody();
				this.systemThemeQuery.addEventListener("change", this.scheduleUpdate);
				this.scheduleUpdate();
			}
			destroy() {
				if (!this.started) return;
				this.started = false;
				this.rootObserver?.disconnect();
				this.bodyObserver?.disconnect();
				this.rootObserver = null;
				this.bodyObserver = null;
				this.observedBody = null;
				this.systemThemeQuery.removeEventListener("change", this.scheduleUpdate);
				if (this.animationFrameId !== null) {
					window.cancelAnimationFrame(this.animationFrameId);
					this.animationFrameId = null;
				}
			}
			observeBody() {
				if (!this.bodyObserver || this.observedBody === document.body) return;
				this.bodyObserver.disconnect();
				this.observedBody = document.body;
				this.bodyObserver.observe(document.body, {
					attributeFilter: THEME_ATTRIBUTES,
					attributes: true
				});
			}
			handleRootMutation = () => {
				this.observeBody();
				this.scheduleUpdate();
			};
			scheduleUpdate = () => {
				if (!this.started || this.animationFrameId !== null) return;
				this.animationFrameId = window.requestAnimationFrame(() => {
					this.animationFrameId = null;
					this.updateTheme();
				});
			};
			updateTheme() {
				const bodyStyles = getComputedStyle(document.body);
				const rootStyles = getComputedStyle(document.documentElement);
				const textColor = bodyStyles.color || rootStyles.color || "CanvasText";
				const backgroundColor = getPageBackground();
				const luminance = getRelativeLuminance(backgroundColor);
				const isDark = luminance === null ? this.systemThemeQuery.matches : luminance < .45;
				this.host.dataset.sectionNavTheme = isDark ? "dark" : "light";
				this.host.style.colorScheme = isDark ? "dark" : "light";
				this.host.style.setProperty("--ext-page-text", textColor);
				this.host.style.setProperty("--ext-page-background", backgroundColor);
			}
		};
		//#endregion
		//#region src/client/sectionNav.tsx
		const INITIAL_REFRESH_DELAYS = [
			100,
			400,
			1e3,
			2e3,
			3500
		];
		const MAX_HISTORY_PAGES = 100;
		const LOAD_EARLIER_LABELS = /* @__PURE__ */ new Set([
			"加载更早",
			"加载更多",
			"加载更早的记录",
			"加载历史消息",
			"Load earlier",
			"Load more",
			"Load older"
		]);
		const DIRECTORY_CACHE_LIMIT = 24;
		const directoryCache = /* @__PURE__ */ new Map();
		function sectionsEqual(first, second) {
			return first.length === second.length && first.every((section, index) => {
				const other = second[index];
				return section.key === other?.key && section.index === other?.index && section.textHash === other?.textHash;
			});
		}
		function currentSessionId(ctx) {
			try {
				const current = ctx.get("sessions")?.list?.getSnapshot?.().current;
				if (typeof current === "string" && current.length > 0) return current;
				const binding = ctx.get("uiSession")?.adapter?.current?.getSnapshot?.();
				const key = binding?.key ?? binding?.props?.sessionId;
				return typeof key === "string" && key.length > 0 ? key : void 0;
			} catch {
				return;
			}
		}
		/**
		* Mount the section navigation rail for the current DSH client context.
		* @param ctx - Cordis client context.
		* @returns idempotent disposer that unmounts the rail and releases every listener.
		*/
		function startSectionNav(ctx) {
			const adapter = createDshAdapter({ getSessionId: () => currentSessionId(ctx) });
			document.getElementById(EXTENSION_ROOT_ID)?.remove();
			const shadowRoot = getOrCreateExtensionRoot();
			const style = document.createElement("style");
			style.dataset.plugin = "dsh-section-nav";
			style.textContent = extensionCss;
			shadowRoot.append(style);
			const reactMount = document.createElement("div");
			reactMount.id = "dsh-section-nav-react-root";
			shadowRoot.append(reactMount);
			const reactRoot = (0, react_dom_client.createRoot)(reactMount);
			const bookmarkTargetCache = /* @__PURE__ */ new Map();
			const bookmarkUpgradeIds = /* @__PURE__ */ new Set();
			const refreshTimerIds = /* @__PURE__ */ new Set();
			let watchdogTimerId = null;
			let activeAnswer = null;
			let activeSectionId = null;
			let bookmarks = [];
			let bookmarkNavigationVersion = 0;
			let conversationKey = adapter.getConversationKey();
			let conversationVersion = 0;
			let destroyed = false;
			let drawerOpen = false;
			let railPosition = initialRailPosition(document.documentElement.clientWidth || window.innerWidth);
			let resolvingBookmarkIds = /* @__PURE__ */ new Set();
			const initialCachedDirectory = directoryCache.get(conversationKey);
			let baseSections = initialCachedDirectory?.sections ?? [];
			let sections = baseSections;
			let historyExhausted = initialCachedDirectory?.historyExhausted ?? false;
			let historyNoProgressAttempts = 0;
			let historyLoadGeneration = 0;
			let historyLoadInFlight = false;
			let historyLoadPausedUntil = 0;
			/**
			* Turn the reader last navigated to, restored after history paging.
			*
			* Paging older history must scroll to the top to reach the "load earlier"
			* control, which drags the viewport away from a jump the reader just made.
			* A pause window cannot cover a long page-out, so the target is remembered
			* and re-applied once paging settles.
			*/
			let pendingScrollTargetTurn = null;
			let pendingScrollTargetUntil = 0;
			let t = fallbackTranslate;
			let unsubscribeLocale = () => {};
			let disposeLocale = () => {};
			let unresolvedBookmarkIds = /* @__PURE__ */ new Set();
			let pendingNavigationSection = null;
			let pendingDomSignature = null;
			let pendingDomSignatureTimerId = null;
			let answerTracker;
			let conversationWatcher;
			let routeWatcher;
			function render() {
				if (destroyed) return;
				reactRoot.render(/* @__PURE__ */ (0, react_jsx_runtime.jsx)(react.StrictMode, { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(App, {
					activeSectionId,
					bookmarks,
					drawerOpen,
					onBookmarkDelete: (bookmark) => {
						if (!ensureCurrentConversation()) return;
						const operationKey = conversationKey;
						const operationVersion = conversationVersion;
						bookmarkService.remove(operationKey, bookmark.id).then((nextBookmarks) => {
							updateBookmarksForContext(nextBookmarks, operationKey, operationVersion);
						}).catch(handleBookmarkError);
					},
					onBookmarkSelect: (bookmark) => {
						navigateToBookmark(bookmark);
					},
					onDrawerClose: () => {
						drawerOpen = false;
						render();
					},
					onDrawerToggle: () => {
						if (!ensureCurrentConversation()) return;
						drawerOpen = !drawerOpen;
						render();
					},
					onSectionSelect: (section) => {
						if (!ensureCurrentConversation()) return;
						if (resolveSectionElement(section, adapter) === null) {
							pendingNavigationSection = section;
							historyExhausted = false;
							historyNoProgressAttempts = 0;
							historyLoadPausedUntil = 0;
							historyLoadGeneration += 1;
							loadAllHistory();
							return;
						}
						pendingNavigationSection = null;
						historyLoadPausedUntil = performance.now() + 8e3;
						rememberScrollTarget(section);
						historyLoadGeneration += 1;
						drawerOpen = false;
						activeSectionId = section.id;
						render();
						navigateToSection(section, adapter);
					},
					onToggleBookmark: (section) => {
						if (!ensureCurrentConversation()) return;
						const operationKey = conversationKey;
						const operationVersion = conversationVersion;
						const currentElement = resolveSectionElement(section, adapter);
						const bookmarkSection = currentElement === null ? section : {
							...section,
							element: currentElement
						};
						bookmarkService.toggle(operationKey, bookmarkSection).then((nextBookmarks) => {
							const savedBookmark = nextBookmarks.find((bookmark) => bookmark.sectionKey === bookmarkSection.key);
							if (savedBookmark) bookmarkTargetCache.set(savedBookmark.id, bookmarkSection);
							else for (const [bookmarkId, target] of bookmarkTargetCache) if (target.key === bookmarkSection.key) bookmarkTargetCache.delete(bookmarkId);
							updateBookmarksForContext(nextBookmarks, operationKey, operationVersion);
						}).catch(handleBookmarkError);
					},
					position: railPosition,
					resolvingBookmarkIds,
					sections,
					t,
					unresolvedBookmarkIds
				}) }));
			}
			const updateBookmarks = (nextBookmarks) => {
				if (destroyed) return;
				bookmarks = nextBookmarks;
				const bookmarkIds = new Set(bookmarks.map((bookmark) => bookmark.id));
				for (const bookmarkId of bookmarkTargetCache.keys()) if (!bookmarkIds.has(bookmarkId)) bookmarkTargetCache.delete(bookmarkId);
				resolvingBookmarkIds = new Set([...resolvingBookmarkIds].filter((bookmarkId) => bookmarkIds.has(bookmarkId)));
				unresolvedBookmarkIds = new Set([...unresolvedBookmarkIds].filter((bookmarkId) => bookmarks.some((bookmark) => bookmark.id === bookmarkId)));
				cacheBookmarkTargets(sections);
				cacheResolvedBookmarkTargets();
				render();
			};
			const cacheBookmarkTargets = (nextSections) => {
				for (const bookmark of bookmarks) {
					const section = nextSections.find((candidate) => bookmarkMatchesSection(bookmark, candidate));
					if (!section) continue;
					bookmarkTargetCache.set(bookmark.id, section);
					scheduleBookmarkUpgrade(bookmark, section);
				}
			};
			const getCachedBookmarkTarget = (bookmark) => {
				const target = bookmarkTargetCache.get(bookmark.id);
				if (!target) return null;
				if (!target.element.isConnected) {
					bookmarkTargetCache.delete(bookmark.id);
					return null;
				}
				return target;
			};
			const cacheResolvedBookmarkTargets = () => {
				for (const bookmark of bookmarks) {
					if (getCachedBookmarkTarget(bookmark)) continue;
					const target = resolveBookmark(bookmark, adapter);
					if (target) {
						bookmarkTargetCache.set(bookmark.id, target);
						scheduleBookmarkUpgrade(bookmark, target);
					}
				}
			};
			const scheduleBookmarkUpgrade = (bookmark, section) => {
				if (bookmark.locatorVersion === 2 || bookmarkUpgradeIds.has(bookmark.id)) return;
				const operationKey = conversationKey;
				const operationVersion = conversationVersion;
				bookmarkUpgradeIds.add(bookmark.id);
				bookmarkService.updateLocator(operationKey, bookmark.id, section).then((nextBookmarks) => {
					updateBookmarksForContext(nextBookmarks, operationKey, operationVersion);
				}).catch(handleBookmarkError).finally(() => {
					bookmarkUpgradeIds.delete(bookmark.id);
				});
			};
			const navigateToBookmark = async (bookmark) => {
				if (!ensureCurrentConversation()) return;
				const operationKey = conversationKey;
				const operationVersion = conversationVersion;
				const navigationVersion = ++bookmarkNavigationVersion;
				resolvingBookmarkIds = /* @__PURE__ */ new Set([bookmark.id]);
				unresolvedBookmarkIds = new Set([...unresolvedBookmarkIds].filter((bookmarkId) => bookmarkId !== bookmark.id));
				render();
				const isNavigationCanceled = () => destroyed || operationKey !== conversationKey || operationVersion !== conversationVersion || navigationVersion !== bookmarkNavigationVersion;
				const targetSection = getCachedBookmarkTarget(bookmark) ?? await recoverBookmarkTarget(bookmark, adapter, { isCanceled: isNavigationCanceled });
				if (isNavigationCanceled()) return;
				resolvingBookmarkIds = new Set([...resolvingBookmarkIds].filter((bookmarkId) => bookmarkId !== bookmark.id));
				if (!targetSection) {
					unresolvedBookmarkIds = new Set(unresolvedBookmarkIds).add(bookmark.id);
					render();
					return;
				}
				bookmarkTargetCache.set(bookmark.id, targetSection);
				unresolvedBookmarkIds = new Set([...unresolvedBookmarkIds].filter((bookmarkId) => bookmarkId !== bookmark.id));
				drawerOpen = false;
				activeSectionId = targetSection.id;
				render();
				historyLoadPausedUntil = performance.now() + 8e3;
				rememberScrollTarget(targetSection);
				historyLoadGeneration += 1;
				navigateToSection(targetSection, adapter);
				bookmarkService.updateLocator(operationKey, bookmark.id, targetSection).then((nextBookmarks) => {
					updateBookmarksForContext(nextBookmarks, operationKey, operationVersion);
				}).catch(handleBookmarkError);
			};
			const handleBookmarkError = (_error) => {};
			const updateBookmarksForContext = (nextBookmarks, key, version) => {
				if (key === conversationKey && version === conversationVersion) updateBookmarks(nextBookmarks);
			};
			const loadBookmarks = async (key, version) => {
				try {
					const storedBookmarks = await bookmarkService.list(key);
					updateBookmarksForContext(storedBookmarks, key, version);
				} catch (error) {}
			};
			const positionManager = new PositionManager({ onPositionChange(position) {
				railPosition = position;
				render();
			} });
			/**
			* Re-read the layout target and re-evaluate the rail anchor.
			*
			* The target can be an answer row whose size does not change while the
			* conversation column moves, so this is called on mutations and by the
			* watchdog rather than relying only on the target's ResizeObserver.
			*/
			const refreshPosition = () => {
				if (destroyed) return;
				const targetElement = activeAnswer ? adapter.getMessageContent(activeAnswer.element) ?? activeAnswer.element : adapter.getConversationContainer();
				positionManager.setLayoutTarget(adapter.getLayoutContainer());
				positionManager.setTarget(targetElement);
			};
			const sectionTracker = new SectionTracker({ onActiveSectionChange(sectionId) {
				activeSectionId = sectionId;
				render();
			} });
			const parseAllSections = () => parseTurnSections(conversationKey, adapter);
			const sectionIdentity = (section) => section.messageId !== null ? `id:${section.messageId}` : `key:${section.key}`;
			/**
			* Merge the current DOM window with the cached directory for this Session.
			* DOM entries win because their element is live; cached entries remain for
			* older pages that are not mounted yet.
			*/
			const mergeSections = (cached, dom) => {
				if (cached.length === 0) return [...dom];
				const map = /* @__PURE__ */ new Map();
				for (const section of cached) map.set(sectionIdentity(section), section);
				for (const section of dom) map.set(sectionIdentity(section), section);
				const merged = [...map.values()].sort((first, second) => {
					const firstTurn = first.turnIndex ?? Number.MAX_SAFE_INTEGER;
					const secondTurn = second.turnIndex ?? Number.MAX_SAFE_INTEGER;
					if (firstTurn !== secondTurn) return firstTurn - secondTurn;
					return first.index - second.index;
				});
				return merged.map((section, index) => ({
					...section,
					index,
					nextHeadingHash: merged[index + 1]?.textHash ?? null,
					previousHeadingHash: merged[index - 1]?.textHash ?? null
				}));
			};
			const saveCurrentDirectory = () => {
				if (conversationKey.length === 0 || sections.length === 0) return;
				directoryCache.set(conversationKey, {
					sections: sections.slice(),
					historyExhausted,
					updatedAt: Date.now()
				});
				if (directoryCache.size <= DIRECTORY_CACHE_LIMIT) return;
				let oldestKey;
				let oldestAt = Number.POSITIVE_INFINITY;
				for (const [key, entry] of directoryCache) if (entry.updatedAt < oldestAt) {
					oldestAt = entry.updatedAt;
					oldestKey = key;
				}
				if (oldestKey !== void 0) directoryCache.delete(oldestKey);
			};
			const delay = (ms) => new Promise((resolve) => {
				window.setTimeout(resolve, ms);
			});
			const getConversationScroller = () => document.querySelector("[data-conversation-scroll]");
			const elementIdentity = (element) => element?.getAttribute("data-chat-anchor-key") ?? element?.getAttribute("data-chat-flow-key") ?? "";
			const historyProgressSnapshot = () => {
				const rows = document.querySelectorAll("[data-chat-flow-kind]");
				const first = rows[0];
				const identity = elementIdentity(first);
				return identity.length > 0 ? identity : `count:${rows.length}`;
			};
			const scrollConversationToTop = () => {
				const scroller = getConversationScroller();
				if (scroller !== null) scroller.scrollTop = 0;
			};
			const findLoadEarlierControl = () => {
				const candidates = document.querySelectorAll("button, [role=\"button\"], a, [data-testid*=\"older\"], [data-testid*=\"earlier\"], [class*=\"loadOlder\"], [class*=\"load-older\"]");
				const labels = [...LOAD_EARLIER_LABELS];
				let partial = null;
				for (const element of candidates) {
					const text = normalizeText(element.textContent ?? "");
					const aria = normalizeText(element.getAttribute("aria-label") ?? "");
					const accessible = `${text} ${aria}`.trim();
					if (accessible.length === 0) continue;
					if (labels.includes(text) || labels.includes(aria)) return element;
					if (partial === null && labels.some((label) => accessible.includes(label))) partial = element;
				}
				return partial;
			};
			const isHistoryLoading = () => {
				for (const element of document.querySelectorAll("button, [role=\"button\"]")) {
					const text = normalizeText(element.textContent ?? "");
					if (/loading|加载中/i.test(text) && element.hasAttribute("disabled")) return true;
				}
				return false;
			};
			const waitForHistoryProgress = (before, timeoutMs) => new Promise((resolve) => {
				const startedAt = performance.now();
				const tick = () => {
					if (destroyed) {
						resolve(false);
						return;
					}
					if (historyProgressSnapshot() !== before) {
						resolve(true);
						return;
					}
					if (performance.now() - startedAt > timeoutMs) {
						resolve(false);
						return;
					}
					window.setTimeout(tick, 120);
				};
				tick();
			});
			const waitForEnabledControl = async (timeoutMs) => {
				const startedAt = performance.now();
				while (!destroyed && performance.now() - startedAt < timeoutMs) {
					const control = findLoadEarlierControl();
					if (control !== null && !control.hasAttribute("disabled")) return control;
					await delay(120);
				}
				return null;
			};
			/**
			* Pull one older history page through the session controller rather than the
			* chat button. This is the fallback for embedded / virtualized transcripts
			* that render no paging control in the DOM.
			*/
			const loadOlderViaSession = async () => {
				const sessionId = currentSessionId(ctx);
				if (sessionId === void 0) return false;
				try {
					const sessions = ctx.get("sessions");
					const session = sessions?.binding?.(sessionId)?.session;
					const conversation = sessions?.scope?.(sessionId)?.conversation;
					const loadOlder = session?.loadOlder ?? conversation?.loadOlder;
					if (loadOlder === void 0) return false;
					const scroller = getConversationScroller();
					const beforeTop = scroller?.scrollTop ?? 0;
					const beforeHeight = scroller?.scrollHeight ?? 0;
					const before = historyProgressSnapshot();
					await loadOlder.call(session ?? conversation);
					const progressed = await waitForHistoryProgress(before, 5e3);
					if (progressed && scroller !== null && scroller.scrollHeight > beforeHeight) {
						if (!(beforeHeight - beforeTop - scroller.clientHeight < 60)) scroller.scrollTop = beforeTop + (scroller.scrollHeight - beforeHeight);
					}
					return progressed;
				} catch {
					return false;
				}
			};
			const historyLoadAllowed = (generation) => !destroyed && generation === historyLoadGeneration && performance.now() >= historyLoadPausedUntil;
			/** Remember a navigation so history paging can put the viewport back. */
			const rememberScrollTarget = (section) => {
				if (section.turnIndex === null) return;
				pendingScrollTargetTurn = section.turnIndex;
				pendingScrollTargetUntil = performance.now() + 6e4;
			};
			/**
			* Return the viewport to the remembered navigation target.
			*
			* Paging inserts older content above the viewport, so writing scrollTop
			* would be undone by the next insertion; re-resolving the row and scrolling
			* to it is stable across those inserts.
			* @returns Whether a target row was found and restored.
			*/
			const restoreScrollTarget = () => {
				const turnIndex = pendingScrollTargetTurn;
				if (turnIndex === null) return false;
				if (performance.now() > pendingScrollTargetUntil) {
					pendingScrollTargetTurn = null;
					return false;
				}
				const row = adapter.getUserMessageByTurnIndex(turnIndex);
				const scroller = getConversationScroller();
				if (row === null || !row.isConnected || scroller === null) return false;
				const offset = row.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
				if (Math.abs(offset) < 8) {
					pendingScrollTargetTurn = null;
					return true;
				}
				scroller.scrollTop += offset;
				pendingScrollTargetTurn = null;
				return true;
			};
			const loadAllHistory = async () => {
				if (destroyed || historyExhausted || historyLoadInFlight || performance.now() < historyLoadPausedUntil) return;
				historyLoadInFlight = true;
				const generation = ++historyLoadGeneration;
				try {
					for (let page = 0; page < MAX_HISTORY_PAGES; page += 1) {
						if (destroyed || generation !== historyLoadGeneration || performance.now() < historyLoadPausedUntil) return;
						let control = findLoadEarlierControl();
						if (control === null) {
							if (!historyLoadAllowed(generation)) return;
							scrollConversationToTop();
							control = await waitForEnabledControl(1200);
						}
						if (control === null) {
							if (isHistoryLoading()) return;
							if (!await loadOlderViaSession()) {
								historyNoProgressAttempts += 1;
								if (historyNoProgressAttempts >= 5) historyExhausted = true;
								return;
							}
							historyNoProgressAttempts = 0;
							updateActiveSections();
							continue;
						}
						if (control.hasAttribute("disabled")) {
							control = await waitForEnabledControl(4e3);
							if (control === null) return;
						}
						if (!historyLoadAllowed(generation)) return;
						const before = historyProgressSnapshot();
						control.click();
						if (await waitForHistoryProgress(before, 1e4)) historyNoProgressAttempts = 0;
						else {
							if (isHistoryLoading()) return;
							if (!await loadOlderViaSession()) {
								historyNoProgressAttempts += 1;
								if (historyNoProgressAttempts >= 5) historyExhausted = true;
								return;
							}
							historyNoProgressAttempts = 0;
						}
						updateActiveSections();
						await delay(80);
						restoreScrollTarget();
					}
				} finally {
					historyLoadInFlight = false;
					restoreScrollTarget();
				}
			};
			const updateActiveSections = () => {
				if (pendingDomSignature !== null) {
					if (historyProgressSnapshot() === pendingDomSignature) return;
					pendingDomSignature = null;
					if (pendingDomSignatureTimerId !== null) {
						window.clearTimeout(pendingDomSignatureTimerId);
						pendingDomSignatureTimerId = null;
					}
				}
				const domSections = parseAllSections();
				const nextSections = mergeSections(baseSections, domSections);
				sectionTracker.setSections(domSections);
				refreshPosition();
				if (pendingNavigationSection !== null) {
					const pending = pendingNavigationSection;
					if (resolveSectionElement(pending, adapter) !== null) {
						pendingNavigationSection = null;
						historyLoadPausedUntil = performance.now() + 8e3;
						rememberScrollTarget(pending);
						historyLoadGeneration += 1;
						activeSectionId = pending.id;
						render();
						navigateToSection(pending, adapter);
					}
				}
				if (sectionsEqual(sections, nextSections)) return;
				sections = nextSections;
				cacheBookmarkTargets(sections);
				render();
			};
			conversationWatcher = new ConversationWatcher(adapter, {
				onPotentialRouteChange() {
					return routeWatcher.sync();
				},
				onMutation(mutation) {
					if (routeWatcher.sync()) return;
					conversationWatcher.refreshContainer();
					if (mutation.messagesChanged) {
						answerTracker.refreshMessages();
						updateActiveSections();
						refreshPosition();
						loadAllHistory();
						if (unresolvedBookmarkIds.size > 0) {
							unresolvedBookmarkIds = /* @__PURE__ */ new Set();
							render();
						}
					}
					if (mutation.activeAnswerChanged) updateActiveSections();
				}
			});
			answerTracker = new AnswerTracker(adapter, { onActiveAnswerChange(nextActiveAnswer) {
				activeAnswer = nextActiveAnswer;
				conversationWatcher.setActiveAnswer(activeAnswer?.element ?? null);
				updateActiveSections();
			} });
			const clearRefreshTimers = () => {
				for (const timerId of refreshTimerIds) window.clearTimeout(timerId);
				refreshTimerIds.clear();
			};
			const scheduleMessageRefreshes = () => {
				clearRefreshTimers();
				for (const delay of INITIAL_REFRESH_DELAYS) {
					const timerId = window.setTimeout(() => {
						refreshTimerIds.delete(timerId);
						if (routeWatcher.sync()) return;
						conversationWatcher.refreshContainer();
						answerTracker.refreshMessages();
					}, delay);
					refreshTimerIds.add(timerId);
				}
			};
			const resetForConversation = (nextConversationKey) => {
				saveCurrentDirectory();
				pendingDomSignature = historyProgressSnapshot();
				historyLoadGeneration += 1;
				conversationVersion += 1;
				conversationKey = nextConversationKey;
				const cachedDirectory = directoryCache.get(nextConversationKey);
				baseSections = cachedDirectory?.sections ?? [];
				historyExhausted = cachedDirectory?.historyExhausted ?? false;
				historyNoProgressAttempts = 0;
				sections = baseSections;
				activeAnswer = null;
				activeSectionId = null;
				bookmarks = [];
				bookmarkNavigationVersion += 1;
				bookmarkTargetCache.clear();
				bookmarkUpgradeIds.clear();
				drawerOpen = false;
				railPosition = initialRailPosition(document.documentElement.clientWidth || window.innerWidth);
				resolvingBookmarkIds = /* @__PURE__ */ new Set();
				unresolvedBookmarkIds = /* @__PURE__ */ new Set();
				pendingNavigationSection = null;
				conversationWatcher.setActiveAnswer(null);
				answerTracker.reset();
				refreshPosition();
				sectionTracker.setSections([]);
				render();
				loadBookmarks(conversationKey, conversationVersion);
				scheduleMessageRefreshes();
				if (!historyExhausted) window.setTimeout(() => {
					loadAllHistory();
				}, 800);
				if (pendingDomSignatureTimerId !== null) window.clearTimeout(pendingDomSignatureTimerId);
				pendingDomSignatureTimerId = window.setTimeout(() => {
					pendingDomSignatureTimerId = null;
					pendingDomSignature = null;
					updateActiveSections();
				}, 3e3);
			};
			routeWatcher = new ConversationRouteWatcher(adapter, { onRouteChange({ currentKey }) {
				resetForConversation(currentKey);
			} });
			const ensureCurrentConversation = () => !routeWatcher.sync();
			const handleDocumentPointerDown = (event) => {
				const interactionInsideExtension = event.composedPath().includes(shadowRoot.host);
				if (interactionInsideExtension && !ensureCurrentConversation()) {
					event.preventDefault();
					event.stopPropagation();
					return;
				}
				if (drawerOpen && !interactionInsideExtension) {
					drawerOpen = false;
					render();
				}
			};
			const handleDocumentKeyDown = (event) => {
				if (event.composedPath().includes(shadowRoot.host) && !ensureCurrentConversation()) {
					event.preventDefault();
					event.stopPropagation();
					return;
				}
				if (drawerOpen && event.key === "Escape") {
					drawerOpen = false;
					render();
				}
			};
			const handleDocumentClick = () => {
				routeWatcher.sync();
			};
			const locale = ctx.get("locale");
			if (locale !== void 0 && typeof locale.register === "function" && typeof locale.bind === "function") {
				try {
					disposeLocale = locale.register(NS, {
						en,
						zh
					});
				} catch {}
				t = locale.bind(NS);
			}
			if (locale !== void 0 && typeof locale.subscribe === "function") unsubscribeLocale = locale.subscribe(() => {
				render();
			});
			positionManager.start();
			const themeManager = new ThemeManager(shadowRoot.host);
			themeManager.start();
			sectionTracker.start();
			conversationWatcher.start();
			answerTracker.start();
			routeWatcher.start();
			refreshPosition();
			updateActiveSections();
			if (!historyExhausted) window.setTimeout(() => {
				loadAllHistory();
			}, 800);
			watchdogTimerId = window.setInterval(() => {
				if (destroyed || routeWatcher.sync()) return;
				conversationWatcher.refreshContainer();
				answerTracker.refreshMessages();
				updateActiveSections();
				refreshPosition();
				loadAllHistory();
			}, 1e3);
			document.addEventListener("click", handleDocumentClick);
			document.addEventListener("pointerdown", handleDocumentPointerDown, true);
			document.addEventListener("keydown", handleDocumentKeyDown);
			loadBookmarks(conversationKey, conversationVersion);
			scheduleMessageRefreshes();
			const handlePageHide = (event) => {
				if (event.persisted || destroyed) return;
				dispose();
			};
			const dispose = () => {
				if (destroyed) return;
				saveCurrentDirectory();
				if (pendingDomSignatureTimerId !== null) {
					window.clearTimeout(pendingDomSignatureTimerId);
					pendingDomSignatureTimerId = null;
				}
				destroyed = true;
				historyLoadGeneration += 1;
				clearRefreshTimers();
				if (watchdogTimerId !== null) {
					window.clearInterval(watchdogTimerId);
					watchdogTimerId = null;
				}
				document.removeEventListener("click", handleDocumentClick);
				document.removeEventListener("pointerdown", handleDocumentPointerDown, true);
				document.removeEventListener("keydown", handleDocumentKeyDown);
				window.removeEventListener("pagehide", handlePageHide);
				routeWatcher.destroy();
				conversationWatcher.destroy();
				answerTracker.destroy();
				positionManager.destroy();
				sectionTracker.destroy();
				themeManager.destroy();
				unsubscribeLocale();
				disposeLocale();
				reactRoot.unmount();
				shadowRoot.host.remove();
			};
			window.addEventListener("pagehide", handlePageHide);
			return dispose;
		}
		//#endregion
		//#region src/client/index.tsx
		/** Services that must be available before the rail mounts. */
		const inject = ["locale", "sessions"];
		/**
		* Mount the section navigation rail and register its lifecycle.
		* @param ctx - Cordis client context.
		*/
		function apply(ctx) {
			ctx.effect(() => startSectionNav(ctx), "dsh-section-nav: section rail");
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map