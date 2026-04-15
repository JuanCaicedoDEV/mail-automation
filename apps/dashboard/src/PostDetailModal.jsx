import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { X, ChevronLeft, ChevronRight, Calendar, Copy, Check, Clock, Save, Loader2, Send } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from './lib/utils';
import { parseCaption, parseImageUrls, parseSqliteDate } from './postUtils';

const PostDetailModal = ({ post, campaignId, onClose, onUpdate }) => {
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    const [copied, setCopied] = useState(false);
    const [saving, setSaving] = useState(false);
    const [sending, setSending] = useState(false); // Sending state

    // Newsletter State 
    // ... (rest of state)
    const [isNewsletter, setIsNewsletter] = useState(false);
    const [formData, setFormData] = useState({
        subject: "",
        body: "",
        offer_details: "",
        call_to_action: "",
        caption: "" // Fallback for legacy
    });

    useEffect(() => {
        if (post) {
            const parsed = parseCaption(post.caption);
            if (parsed.isNewsletter) {
                setIsNewsletter(true);
                setFormData({
                    subject: parsed.subject,
                    body: parsed.body,
                    offer_details: parsed.offer_details,
                    call_to_action: parsed.call_to_action,
                    caption: ""
                });
            } else {
                setIsNewsletter(false);
                setFormData(prev => ({ ...prev, caption: post.caption || "" }));
            }
        }
    }, [post]);

    if (!post) return null;

    const images = parseImageUrls(post.image_urls);

    const hasMultipleImages = images && images.length > 1;

    const nextImage = () => setCurrentImageIndex((prev) => (prev + 1) % images.length);
    const prevImage = () => setCurrentImageIndex((prev) => (prev - 1 + images.length) % images.length);

    const copyCaption = () => {
        const textToCopy = isNewsletter
            ? `Subject: ${formData.subject}\n\n${formData.body}\n\nOffer: ${formData.offer_details}\n\nCTA: ${formData.call_to_action}`
            : formData.caption;

        navigator.clipboard.writeText(textToCopy || "");
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            let finalCaption = formData.caption;
            if (isNewsletter) {
                finalCaption = JSON.stringify({
                    subject: formData.subject,
                    body: formData.body,
                    offer_details: formData.offer_details,
                    call_to_action: formData.call_to_action
                });
            }

            await axios.put(`/posts/${post.id}`, {
                caption: finalCaption,
                status: post.status // Maintain status or update if needed
            });
            alert("Saved successfully!");
            if (onUpdate) onUpdate({ ...post, caption: finalCaption });
        } catch (e) {
            console.error("Failed to save", e);
            alert("Failed to save changes");
        } finally {
            setSaving(false);
        }
    };

    const handleSend = async () => {
        if (!campaignId) {
            alert("Campaign ID missing");
            return;
        }

        if (!confirm("Are you sure you want to send this newsletter to all pending leads?")) return;

        setSending(true);
        try {
            // Save current edits first
            let finalCaption = formData.caption;
            if (isNewsletter) {
                finalCaption = JSON.stringify({
                    subject: formData.subject,
                    body: formData.body,
                    offer_details: formData.offer_details,
                    call_to_action: formData.call_to_action
                });
            }
            await axios.put(`/posts/${post.id}`, { caption: finalCaption, status: post.status });

            // Use backend render endpoint for HTML template
            const renderRes = await axios.post(`/emails/${post.id}/render`);
            const { html: bodyTemplate, subject } = renderRes.data;

            await axios.post(`/campaigns/${campaignId}/send`, {
                subject: subject,
                body_template: bodyTemplate
            });

            alert("Campaign sent successfully! Emails are being queued.");
            onClose();
        } catch (e) {
            console.error("Failed to send campaign", e);
            alert("Failed to send campaign: " + (e.response?.data?.detail || e.message));
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col md:flex-row relative animate-in zoom-in-95 duration-200">

                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 z-10 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full transition-colors"
                >
                    <X className="w-5 h-5" />
                </button>

                {/* Left: Image Carousel (Simulates Newsletter Header/Hero) */}
                <div className="w-full md:w-5/12 bg-gray-900 relative flex items-center justify-center min-h-[300px] md:min-h-full">
                    {images.length > 0 ? (
                        <>
                            <img
                                src={images[currentImageIndex]}
                                alt="Email visual"
                                className="max-w-full max-h-full object-contain"
                            />

                            {hasMultipleImages && (
                                <>
                                    <button
                                        onClick={prevImage}
                                        className="absolute left-4 top-1/2 -translate-y-1/2 p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors border border-white/20"
                                    >
                                        <ChevronLeft className="w-6 h-6" />
                                    </button>
                                    <button
                                        onClick={nextImage}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors border border-white/20"
                                    >
                                        <ChevronRight className="w-6 h-6" />
                                    </button>
                                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                                        {images.map((_, idx) => (
                                            <button
                                                key={idx}
                                                onClick={() => setCurrentImageIndex(idx)}
                                                className={cn(
                                                    "w-2 h-2 rounded-full transition-all",
                                                    idx === currentImageIndex ? "bg-white w-4" : "bg-white/40 hover:bg-white/60"
                                                )}
                                            />
                                        ))}
                                    </div>
                                </>
                            )}
                        </>
                    ) : (
                        <div className="text-gray-500">No visuals available</div>
                    )}
                </div>

                {/* Right: Editor */}
                <div className="w-full md:w-7/12 flex flex-col h-full bg-white">
                    <div className="p-6 flex-1 overflow-y-auto">
                        {/* Header Info */}
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <span className={cn(
                                    "px-2.5 py-1 rounded-full text-xs font-semibold tracking-wide uppercase",
                                    post.status === 'APPROVED' ? "bg-green-100 text-green-700" :
                                        post.status === 'PENDING' ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"
                                )}>
                                    {isNewsletter ? "Newsletter" : post.status}
                                </span>
                                {post.scheduled_at && (
                                    <div className="flex items-center gap-1.5 text-sm text-gray-500">
                                        <Calendar className="w-4 h-4" />
                                        <span>{format(parseSqliteDate(post.scheduled_at), "MMM d, h:mm a")}</span>
                                    </div>
                                )}
                            </div>
                            <button
                                onClick={copyCaption}
                                className="text-xs flex items-center gap-1 text-indigo-600 hover:text-indigo-700 font-medium transition-colors"
                            >
                                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                {copied ? "Copied!" : "Copy Content"}
                            </button>
                        </div>

                        {/* Editor Form */}
                        <div className="space-y-5">
                            {isNewsletter ? (
                                <>
                                    {/* Subject Line */}
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Subject Line</label>
                                        <input
                                            value={formData.subject}
                                            onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                                            className="w-full border border-gray-200 rounded-lg p-3 text-lg font-medium text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                                            placeholder="Enter subject line..."
                                        />
                                    </div>

                                    {/* Body */}
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Email Body</label>
                                        <textarea
                                            value={formData.body}
                                            onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                                            className="w-full border border-gray-200 rounded-lg p-3 text-sm text-gray-700 h-40 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none"
                                            placeholder="Write the main content..."
                                        />
                                    </div>

                                    {/* Offer & CTA (Grid) */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Offer / Discount (Layer 1)</label>
                                            <textarea
                                                value={formData.offer_details}
                                                onChange={(e) => setFormData({ ...formData, offer_details: e.target.value })}
                                                className="w-full border border-gray-200 rounded-lg p-3 text-sm text-gray-700 h-24 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none bg-orange-50 border-orange-100"
                                                placeholder="Describe the deal..."
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Call to Action</label>
                                            <div className="h-24 flex items-center">
                                                <input
                                                    value={formData.call_to_action}
                                                    onChange={(e) => setFormData({ ...formData, call_to_action: e.target.value })}
                                                    className="w-full border border-gray-200 rounded-lg p-3 text-sm font-medium text-center text-white bg-indigo-600 hover:bg-indigo-700 transition-colors focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 outline-none"
                                                    placeholder="Button Text"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                /* Legacy Caption View */
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Legacy Content</label>
                                    <textarea
                                        value={formData.caption}
                                        onChange={(e) => setFormData({ ...formData, caption: e.target.value })}
                                        className="w-full border border-gray-200 rounded-lg p-3 text-sm text-gray-700 h-64 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none"
                                        placeholder="Content..."
                                    />
                                </div>
                            )}

                            {/* Prompt Info (Read Only) */}
                            <div className="pt-4 border-t border-gray-100">
                                <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Generated From</h4>
                                <p className="text-xs text-gray-500">{post.specific_prompt}</p>
                            </div>
                        </div>
                    </div>

                    {/* Actions Footer */}
                    <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3 sticky bottom-0">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
                        >
                            Cancel
                        </button>

                        {/* Send Button */}
                        <button
                            onClick={handleSend}
                            disabled={sending || saving}
                            className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg shadow-sm hover:shadow transition-all flex items-center gap-2"
                        >
                            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                            Send Campaign
                        </button>

                        <button
                            onClick={handleSave}
                            disabled={saving || sending}
                            className="px-6 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm hover:shadow transition-all flex items-center gap-2"
                        >
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            Save Changes
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PostDetailModal;
