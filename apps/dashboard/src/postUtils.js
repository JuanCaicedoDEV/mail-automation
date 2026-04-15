/**
 * postUtils.js — Centralized parsing utilities for post/email content.
 * 
 * All components should use these helpers instead of ad-hoc JSON.parse calls.
 * This is the single source of truth for how post captions and image_urls are parsed.
 */

/**
 * Parse a post caption (which may be JSON or plain text) into structured content.
 * @param {string|null} caption - The raw caption string from the database.
 * @returns {{ subject: string, body: string, offer_details: string, call_to_action: string, isNewsletter: boolean, raw: string }}
 */
export function parseCaption(caption) {
    const result = {
        subject: "",
        body: "",
        offer_details: "",
        call_to_action: "",
        isNewsletter: false,
        raw: caption || ""
    };

    if (!caption) return result;

    try {
        const parsed = JSON.parse(caption);
        if (parsed && typeof parsed === 'object' && parsed.subject) {
            result.subject = parsed.subject || "";
            result.body = parsed.body || "";
            result.offer_details = parsed.offer_details || "";
            result.call_to_action = parsed.call_to_action || "";
            result.isNewsletter = true;
        }
    } catch (e) {
        // Not JSON — treat as plain text caption
    }

    return result;
}

/**
 * Parse image_urls from the API (may be a JSON string or an array).
 * @param {string|Array|null} imageUrls - Raw image_urls value.
 * @returns {string[]} Array of image URL strings.
 */
export function parseImageUrls(imageUrls) {
    if (!imageUrls) return [];
    if (Array.isArray(imageUrls)) return imageUrls;

    try {
        const parsed = JSON.parse(imageUrls);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        return [];
    }
}

/**
 * Parse a SQLite datetime string (e.g. "2026-03-16 14:15:39") into a valid JS Date.
 * SQLite uses a space between date and time; JS Date/date-fns requires "T".
 * @param {string|null} value
 * @returns {Date}
 */
export function parseSqliteDate(value) {
    if (!value) return new Date(NaN);
    // Replace space separator with T to produce a valid ISO 8601 string
    return new Date(String(value).replace(' ', 'T'));
}

/**
 * Get a display label for a post (used in dropdowns, lists, etc.).
 * @param {object} post - Post object with caption and created_at fields.
 * @returns {string} Human-readable label.
 */
export function getPostLabel(post) {
    if (!post) return "Untitled";

    const { subject, isNewsletter } = parseCaption(post.caption);

    if (isNewsletter && subject) {
        return subject;
    }

    // Fallback to truncated caption
    const raw = post.caption || post.specific_prompt || "Untitled";
    return raw.length > 50 ? raw.substring(0, 50) + "..." : raw;
}

/**
 * Serialize newsletter form data back to a caption JSON string.
 * @param {{ subject: string, body: string, offer_details: string, call_to_action: string }} formData
 * @returns {string} JSON string ready for the API.
 */
export function serializeCaption(formData) {
    return JSON.stringify({
        subject: formData.subject,
        body: formData.body,
        offer_details: formData.offer_details || "",
        call_to_action: formData.call_to_action || ""
    });
}
