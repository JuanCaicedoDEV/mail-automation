import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Upload, Send, Users, CheckCircle, AlertCircle, Loader2, FileText, Mail, Sparkles, History, Clock, Plus, X, Eye, EyeOff } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from './lib/utils';
import { parseCaption, parseImageUrls, getPostLabel, parseSqliteDate } from './postUtils';

// --- Inline Toast Notification Component ---
function Toast({ message, type = 'info', onClose }) {
  const colors = {
    success: 'bg-green-50 border-green-200 text-green-800',
    error: 'bg-red-50 border-red-200 text-red-800',
    info: 'bg-indigo-50 border-indigo-200 text-indigo-800',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-800'
  };
  const icons = {
    success: <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />,
    error: <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />,
    info: <Loader2 className="w-4 h-4 text-indigo-600 flex-shrink-0" />,
    warning: <AlertCircle className="w-4 h-4 text-yellow-600 flex-shrink-0" />
  };

  useEffect(() => {
    if (type === 'success' || type === 'info') {
      const timer = setTimeout(onClose, 5000);
      return () => clearTimeout(timer);
    }
  }, [type, onClose]);

  return (
    <div className={`flex items-center gap-2 px-4 py-3 rounded-lg border text-sm font-medium animate-in fade-in slide-in-from-top-2 duration-200 ${colors[type]}`}>
      {icons[type]}
      <span className="flex-1">{message}</span>
      <button onClick={onClose} className="text-current opacity-50 hover:opacity-100">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export default function LeadsManager({ campaignId, posts = [], onGenerate }) {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendProgress, setSendProgress] = useState({ current: 0, total: 0 });
  const [stats, setStats] = useState({ total: 0, pending: 0, sent: 0, failed: 0 });
  const [gmailStatus, setGmailStatus] = useState({ connected: false, email: null, loading: true });
  const [activeTab, setActiveTab] = useState('leads'); // 'leads' or 'history'

  // Toast notifications
  const [toasts, setToasts] = useState([]);
  const addToast = (message, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
  };
  const removeToast = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const publishedPosts = posts.filter(p => p.status === 'PUBLISHED')
    .sort((a, b) => parseSqliteDate(b.created_at) - parseSqliteDate(a.created_at));
  const [selectedPostId, setSelectedPostId] = useState("");
  const [confirmAction, setConfirmAction] = useState(null); // 'send' or 'schedule'
  const [generatePrompt, setGeneratePrompt] = useState("");
  const [manualLead, setManualLead] = useState({ name: '', email: '' });
  const [addingLead, setAddingLead] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingPostId, setGeneratingPostId] = useState(null);

  // Email Preview State
  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewIframeRef = useRef(null);

  const [formData, setFormData] = useState({
    subject: "",
    body: "",
    offer_details: "",
    call_to_action: "",
    imageUrl: ""
  });

  useEffect(() => {
    if (campaignId) {
      fetchLeads();
    }
  }, [campaignId]);

  // Check Gmail connection status on mount
  useEffect(() => {
    const checkGmailStatus = async () => {
      try {
        const res = await axios.get('/auth/status');
        setGmailStatus({ connected: res.data.connected, email: res.data.email, loading: false });
      } catch (e) {
        setGmailStatus({ connected: false, email: null, loading: false });
      }
    };
    checkGmailStatus();

    // Also check if we just returned from OAuth flow
    const params = new URLSearchParams(window.location.search);
    if (params.get('connected') === 'true') {
      checkGmailStatus();
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const handleConnectGmail = async () => {
    try {
      const res = await axios.get('/auth/zoho/login');
      if (res.data.url) {
        window.location.href = res.data.url;
      }
    } catch (e) {
      addToast('Failed to start Gmail connection. Make sure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set in .env', 'error');
    }
  };

  useEffect(() => {
    const newStats = {
      total: leads.length,
      sent: leads.filter(l => l.status === 'SENT').length,
      failed: leads.filter(l => l.status === 'FAILED').length
    };
    setStats(newStats);
  }, [leads]);

  // Load Newsletter Data when selection changes
  useEffect(() => {
    if (selectedPostId && Array.isArray(posts)) {
      const post = posts.find(p => p.id === parseInt(selectedPostId));
      if (post) {
        if (post.status === 'PENDING') {
          return;
        }

        const parsed = parseCaption(post.caption);
        const images = parseImageUrls(post.image_urls);

        setFormData({
          subject: parsed.subject || "",
          body: parsed.body || "",
          offer_details: parsed.offer_details || "",
          call_to_action: parsed.call_to_action || "",
          imageUrl: images.length > 0 ? images[0] : "",
          scheduledAt: post.scheduled_at ? parseSqliteDate(post.scheduled_at).toISOString().slice(0, 16) : ""
        });

        // Auto-load preview when selecting a post
        loadPreview(post.id);
      }
    } else {
      setFormData({
        subject: "",
        body: "",
        offer_details: "",
        call_to_action: "",
        imageUrl: "",
        scheduledAt: ""
      });
      setPreviewHtml('');
      setShowPreview(false);
    }
  }, [selectedPostId, posts]);

  // Watch for generated post completion
  useEffect(() => {
    if (generatingPostId && Array.isArray(posts)) {
      const post = posts.find(p => p.id === generatingPostId);
      if (post && post.status !== 'PENDING') {
        setIsGenerating(false);
        setGeneratingPostId(null);
        setSelectedPostId(post.id.toString());
        addToast('Email content generated successfully!', 'success');
      }
    }
  }, [posts, generatingPostId]);

  // --- Load Email Preview ---
  const loadPreview = async (postId) => {
    if (!postId) return;
    setPreviewLoading(true);
    try {
      const res = await axios.get(`/emails/${postId}/preview`);
      setPreviewHtml(res.data.html);
      setShowPreview(true);
    } catch (e) {
      console.error("Preview failed", e);
      setPreviewHtml('');
    } finally {
      setPreviewLoading(false);
    }
  };

  // Update preview iframe content
  useEffect(() => {
    if (previewIframeRef.current && previewHtml) {
      const doc = previewIframeRef.current.contentDocument;
      if (doc) {
        doc.open();
        doc.write(`
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8"/>
            <style>
              body { margin: 0; padding: 20px; font-family: sans-serif; background: #f9fafb; }
            </style>
          </head>
          <body>${previewHtml}</body>
          </html>
        `);
        doc.close();
      }
    }
  }, [previewHtml]);

  const handleGenerate = async () => {
    if (!onGenerate) return;
    setIsGenerating(true);
    try {
      const newPostId = await onGenerate(generatePrompt);
      if (newPostId) {
        setGeneratingPostId(newPostId);
        setGeneratePrompt("");
      } else {
        setIsGenerating(false);
      }
    } catch (e) {
      console.error("Generation failed", e);
      setIsGenerating(false);
      addToast("Failed to start generation.", "error");
    }
  };


  const fetchLeads = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`/campaigns/${campaignId}/leads`);
      setLeads(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      console.error("Failed to fetch leads", e);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await axios.post(`/campaigns/${campaignId}/leads/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      addToast(`Imported ${res.data.added} leads from CSV.`, 'success');
      fetchLeads();
    } catch (err) {
      console.error("Upload failed", err);
      addToast("Failed to upload CSV. Ensure it has an 'email' column.", "error");
    } finally {
      setUploading(false);
      e.target.value = null;
    }
  };

  const handleAddManualLead = async (e) => {
    e.preventDefault();
    if (!manualLead.email) {
      addToast("Please provide at least an email address.", "warning");
      return;
    }

    setAddingLead(true);
    try {
      await axios.post(`/campaigns/${campaignId}/leads`, manualLead);
      setManualLead({ name: '', email: '' });
      fetchLeads();
      addToast("Lead added successfully!", "success");
    } catch (err) {
      console.error("Failed to add lead", err);
      const detail = err.response?.data?.detail;
      const msg = typeof detail === 'string' ? detail : (detail && detail[0]?.msg) || "Unknown error";
      addToast(`Error adding lead: ${msg}`, "error");
    } finally {
      setAddingLead(false);
    }
  };

  // Schedule handler
  const handleApproveAndSchedule = async () => {
    if (!gmailStatus.connected) {
      addToast("Gmail not connected. Enter credentials in Settings or click 'Connect Zoho' below.", "error");
      return;
    }

    if (!formData.subject || !formData.body) {
      addToast("Please provide at least a subject and body.", "warning");
      return;
    }

    if (!formData.scheduledAt) {
      addToast("Please select a date and time to schedule.", "warning");
      return;
    }

    if (new Date(formData.scheduledAt) <= new Date()) {
      addToast("Scheduled time must be in the future.", "warning");
      return;
    }

    if (confirmAction !== 'schedule') {
      setConfirmAction('schedule');
      // Auto-reset after 5 seconds
      setTimeout(() => setConfirmAction(null), 5000);
      return;
    }

    setConfirmAction(null);

    setSending(true);
    try {
      const captionData = JSON.stringify({
        subject: formData.subject,
        body: formData.body,
        offer_details: formData.offer_details,
        call_to_action: formData.call_to_action,
      });

      await axios.patch(`/posts/${selectedPostId}`, {
        caption: captionData,
        status: 'APPROVED',
        scheduled_at: new Date(formData.scheduledAt).toISOString()
      });

      addToast(`Campaign approved and scheduled for ${new Date(formData.scheduledAt).toLocaleString()}!`, 'success');
      setTimeout(fetchLeads, 1000);
    } catch (err) {
      console.error("Scheduling failed", err);
      addToast("Failed to schedule campaign.", "error");
    } finally {
      setSending(false);
    }
  };

  const handleSendCampaign = async () => {
    if (!gmailStatus.connected) {
      addToast("Gmail not connected. Enter credentials in Settings or click 'Connect Zoho' below.", "error");
      return;
    }

    if (!formData.subject || !formData.body) {
      addToast("Please provide at least a subject and body.", "warning");
      return;
    }

    if (confirmAction !== 'send') {
      setConfirmAction('send');
      // Auto-reset after 5 seconds
      setTimeout(() => setConfirmAction(null), 5000);
      return;
    }

    setConfirmAction(null);

    setSending(true);
    setSendProgress({ current: 0, total: stats.total });
    try {
      let bodyTemplate = "";
      let subject = formData.subject;

      if (selectedPostId) {
        // Save edits first, then use backend render endpoint
        const captionData = JSON.stringify({
          subject: formData.subject,
          body: formData.body,
          offer_details: formData.offer_details,
          call_to_action: formData.call_to_action,
        });
        await axios.patch(`/posts/${selectedPostId}`, { caption: captionData });

        // Use backend render endpoint
        const renderRes = await axios.post(`/emails/${selectedPostId}/render`);
        bodyTemplate = renderRes.data.html;
        subject = renderRes.data.subject;
      } else {
        // Manual plain text entry
        const baseUrl = axios.defaults.baseURL || window.location.origin;
        const finalImageUrl = formData.imageUrl
          ? (formData.imageUrl.startsWith('http') ? formData.imageUrl : `${baseUrl}${formData.imageUrl}`)
          : '';

        bodyTemplate = `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
                  ${finalImageUrl ? `<img src="${finalImageUrl}" style="width: 100%; border-radius: 8px; margin-bottom: 20px;" />` : ''}
                  <h1 style="color: #111; margin-bottom: 20px;">${formData.subject}</h1>
                  <p>Hi {{name}},</p>
                  <p style="line-height: 1.6;">${formData.body.replace(/\n/g, '<br/>')}</p>
                  <p style="font-size: 12px; color: #999; text-align: center; margin-top: 40px;">
                    You received this email because you signed up for our newsletter.<br />
                    <a href="#" style="color: #999;">Unsubscribe</a>
                  </p>
              </div>
        `;
      }

      const res = await axios.post(`/campaigns/${campaignId}/send`, {
        subject: subject,
        body_template: bodyTemplate
      });

      addToast(`${res.data.message}`, 'success');

      // Poll for lead status updates
      const pollInterval = setInterval(async () => {
        try {
          const leadsRes = await axios.get(`/campaigns/${campaignId}/leads`);
          const updatedLeads = Array.isArray(leadsRes.data) ? leadsRes.data : [];
          setLeads(updatedLeads);
          const sent = updatedLeads.filter(l => l.status === 'SENT').length;
          const failed = updatedLeads.filter(l => l.status === 'FAILED').length;
          setSendProgress({ current: sent + failed, total: updatedLeads.length });

          if (sent + failed >= updatedLeads.length) {
            clearInterval(pollInterval);
            setSending(false);
            setSendProgress({ current: 0, total: 0 });
            addToast(`Sending complete! ${sent} sent, ${failed} failed.`, sent > 0 ? 'success' : 'warning');
          }
        } catch (e) {
          clearInterval(pollInterval);
          setSending(false);
        }
      }, 3000);

      // Safety: stop polling after 5 minutes
      setTimeout(() => {
        clearInterval(pollInterval);
        setSending(false);
      }, 300000);

    } catch (err) {
      console.error("Sending failed", err);
      const msg = err.response?.data?.detail || "Failed to start sending.";
      addToast(`Error: ${msg}`, "error");
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Notifications */}
      {toasts.length > 0 && (
        <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm">
          {toasts.map(t => (
            <Toast key={t.id} message={t.message} type={t.type} onClose={() => removeToast(t.id)} />
          ))}
        </div>
      )}

      {/* Send Progress Bar */}
      {sending && sendProgress.total > 0 && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-sm font-medium text-indigo-700">
              <Loader2 className="w-4 h-4 animate-spin" />
              Sending emails...
            </div>
            <span className="text-xs text-indigo-500">
              {sendProgress.current} / {sendProgress.total}
            </span>
          </div>
          <div className="w-full bg-indigo-100 rounded-full h-2">
            <div
              className="bg-indigo-600 h-2 rounded-full transition-all duration-500"
              style={{ width: `${sendProgress.total > 0 ? (sendProgress.current / sendProgress.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {/* Guided Flow Stepper */}
      {(() => {
        const hasAudience = stats.total > 0;
        const hasContent = !!(formData.subject && formData.body);
        const hasPreview = showPreview && previewHtml;
        const isReady = hasAudience && hasContent && gmailStatus.connected;

        const steps = [
          { label: 'Import Audience', done: hasAudience, hint: hasAudience ? `${stats.total} leads` : 'Upload CSV or add leads' },
          { label: 'Create Content', done: hasContent, hint: hasContent ? formData.subject : 'Generate or write email' },
          { label: 'Review Preview', done: hasPreview, hint: hasPreview ? 'Preview loaded' : 'Click "Show Email Preview"' },
          { label: 'Send Campaign', done: stats.sent > 0, hint: isReady ? 'Ready to send!' : 'Complete previous steps' }
        ];

        const currentStep = steps.findIndex(s => !s.done);

        return (
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-1">
              {steps.map((step, i) => (
                <React.Fragment key={i}>
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${step.done ? 'bg-green-100 text-green-700' :
                      i === currentStep ? 'bg-indigo-600 text-white ring-2 ring-indigo-200' :
                        'bg-gray-100 text-gray-400'
                      }`}>
                      {step.done ? <CheckCircle className="w-4 h-4" /> : i + 1}
                    </div>
                    <div className="min-w-0">
                      <div className={`text-xs font-semibold truncate ${step.done ? 'text-green-700' :
                        i === currentStep ? 'text-indigo-700' :
                          'text-gray-400'
                        }`}>{step.label}</div>
                      <div className="text-[10px] text-gray-400 truncate">{step.hint}</div>
                    </div>
                  </div>
                  {i < steps.length - 1 && (
                    <div className={`flex-shrink-0 w-8 h-0.5 mx-1 rounded ${step.done ? 'bg-green-300' : 'bg-gray-200'}`} />
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Header Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col">
          <span className="text-xs text-indigo-600 font-medium uppercase tracking-wider">Total Audience</span>
          <span className="text-2xl font-bold text-indigo-700 mt-1">{stats.total}</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col">
          <span className="text-xs text-green-600 font-medium uppercase tracking-wider">Emails Sent</span>
          <span className="text-2xl font-bold text-green-700 mt-1">{stats.sent}</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col">
          <span className="text-xs text-red-600 font-medium uppercase tracking-wider">Failed</span>
          <span className="text-2xl font-bold text-red-700 mt-1">{stats.failed}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Column: Actions (Upload & Compose) */}
        <div className="space-y-6">

          {/* Upload Section */}
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5 text-indigo-600" /> Import Leads
            </h3>
            <div className="relative border-2 border-dashed border-gray-300 rounded-lg p-6 bg-gray-50 flex flex-col items-center justify-center text-center">
              {uploading ? (
                <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
              ) : (
                <div className="space-y-2">
                  <Upload className="w-8 h-8 text-gray-400 mx-auto" />
                  <p className="text-sm text-gray-600">
                    Upload CSV with <code className="bg-gray-200 px-1 py-0.5 rounded text-xs">email</code> and <code className="bg-gray-200 px-1 py-0.5 rounded text-xs">name</code> columns.
                  </p>
                </div>
              )}
              <input
                type="file"
                accept=".csv"
                disabled={uploading}
                onChange={handleFileUpload}
                className="opacity-0 absolute inset-0 cursor-pointer w-full h-full"
              />
            </div>
          </div>

          {/* Manual Lead Entry Section */}
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-600" /> Add Individual Lead
            </h3>
            <form onSubmit={handleAddManualLead} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Email</label>
                  <input
                    type="email"
                    required
                    placeholder="example@mail.com"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    value={manualLead.email}
                    onChange={(e) => setManualLead({ ...manualLead, email: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Name</label>
                  <input
                    type="text"
                    placeholder="John Doe"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    value={manualLead.name}
                    onChange={(e) => setManualLead({ ...manualLead, name: e.target.value })}
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={addingLead || !manualLead.email}
                className="w-full bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm font-medium transition-colors"
              >
                {addingLead ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Add Lead
              </button>
            </form>
          </div>

          {/* Compose Section */}
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Mail className="w-5 h-5 text-indigo-600" /> Compose Campaign
            </h3>
            <div className="space-y-4">
              {/* Newsletter Selector & AI Generation */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Load or Generate Content</label>
                <div className="flex gap-2">
                  <select
                    value={selectedPostId}
                    onChange={(e) => setSelectedPostId(e.target.value)}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 bg-white"
                  >
                    <option value="">-- Manual Entry --</option>
                    {Array.isArray(posts) && posts.map(post => {
                      if (!post) return null;
                      const label = getPostLabel(post);

                      let dateLabel = "";
                      try {
                        if (post.created_at) {
                          dateLabel = format(parseSqliteDate(post.created_at), 'MMM d');
                        }
                      } catch (e) {
                        dateLabel = "";
                      }

                      return (
                        <option key={post.id} value={post.id}>
                          {label} {dateLabel ? `(${dateLabel})` : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* AI Generation Box */}
                <div className="bg-gradient-to-r from-indigo-50 to-purple-50 p-3 rounded-lg border border-indigo-100">
                  {!isGenerating ? (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="E.g. Summer sale announcement..."
                        className="flex-1 text-xs border border-gray-300 rounded-md px-2 py-1.5 focus:ring-1 focus:ring-indigo-500"
                        value={generatePrompt}
                        onChange={(e) => setGeneratePrompt(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleGenerate();
                        }}
                      />
                      <button
                        onClick={handleGenerate}
                        disabled={!onGenerate}
                        className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-md font-medium flex items-center gap-1.5 transition-colors"
                      >
                        <Sparkles className="w-3 h-3" />
                        Generate
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-2 text-xs text-indigo-700 font-medium py-1.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Creating & Generating Newsletter...
                    </div>
                  )}
                </div>
              </div>

              {/* Email Preview Toggle */}
              {selectedPostId && (
                <button
                  onClick={() => {
                    if (!showPreview && !previewHtml) loadPreview(parseInt(selectedPostId));
                    setShowPreview(!showPreview);
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2 border border-indigo-200 rounded-lg text-indigo-600 hover:bg-indigo-50 text-sm font-medium transition-colors"
                >
                  {showPreview ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  {showPreview ? 'Hide Email Preview' : 'Show Email Preview'}
                </button>
              )}

              {/* Live Email Preview */}
              {showPreview && selectedPostId && (
                <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
                  <div className="bg-gray-100 px-4 py-2 border-b border-gray-200 flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                      <Eye className="w-3.5 h-3.5" /> Email Preview
                    </span>
                    <button
                      onClick={() => loadPreview(parseInt(selectedPostId))}
                      className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                    >
                      Refresh
                    </button>
                  </div>
                  {previewLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
                    </div>
                  ) : (
                    <iframe
                      ref={previewIframeRef}
                      className="w-full border-0"
                      style={{ height: '400px' }}
                      title="Email Preview"
                      sandbox="allow-same-origin"
                    />
                  )}
                </div>
              )}

              {/* Image Preview (If Newsletter Selected) */}
              {selectedPostId && formData.imageUrl && !showPreview && (
                <div className="relative aspect-video bg-gray-100 rounded-lg overflow-hidden border border-gray-200">
                  <img src={formData.imageUrl} alt="Newsletter Header" className="w-full h-full object-cover" />
                  <div className="absolute bottom-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded">
                    Header Image
                  </div>
                </div>
              )}

              {/* Editable Fields */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                <input
                  type="text"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
                  placeholder="e.g. Exclusive Offer"
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Body <span className="text-xs text-gray-400 font-normal">(Use {"{{name}}"} for name)</span>
                </label>
                <textarea
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm h-32 focus:ring-2 focus:ring-indigo-500"
                  placeholder="Hi {{name}}, ..."
                  value={formData.body}
                  onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                />
              </div>

              {selectedPostId && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Offer Details <span className="text-xs text-gray-400">(Highlighted Box)</span>
                    </label>
                    <textarea
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm h-20 focus:ring-2 focus:ring-indigo-500 bg-orange-50 border-orange-200"
                      placeholder="Special 20% off..."
                      value={formData.offer_details}
                      onChange={(e) => setFormData({ ...formData, offer_details: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Call to Action (Button)</label>
                    <input
                      type="text"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 font-medium text-indigo-600"
                      placeholder="Shop Now"
                      value={formData.call_to_action}
                      onChange={(e) => setFormData({ ...formData, call_to_action: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Scheduled For</label>
                    <input
                      type="datetime-local"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 font-medium text-gray-700 bg-gray-50"
                      value={formData.scheduledAt}
                      onChange={(e) => setFormData({ ...formData, scheduledAt: e.target.value })}
                    />
                  </div>
                </>
              )}

              {/* Gmail Connection Status */}
              {gmailStatus.loading ? (
                <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Checking Gmail connection...
                </div>
              ) : gmailStatus.connected ? (
                <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm">
                  <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                  <span className="text-green-800 font-medium">Sending from:</span>
                  <span className="text-green-700">{gmailStatus.email}</span>
                  <button
                    onClick={handleConnectGmail}
                    className="ml-auto text-xs text-green-600 underline hover:text-green-800"
                  >
                    Switch
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleConnectGmail}
                  className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-indigo-300 rounded-lg py-3 text-indigo-600 hover:bg-indigo-50 hover:border-indigo-400 transition-colors font-medium text-sm"
                >
                  <Mail className="w-4 h-4" />
                  Connect Zoho to Send Emails
                </button>
              )}

              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={handleSendCampaign}
                  disabled={sending || stats.total === 0}
                  className={cn(
                    "flex-1 py-2.5 rounded-lg flex items-center justify-center gap-2 font-medium shadow-sm transition-all duration-200",
                    confirmAction === 'send'
                      ? "bg-orange-500 hover:bg-orange-600 text-white ring-4 ring-orange-100 animate-pulse"
                      : "bg-indigo-600 hover:bg-indigo-700 text-white"
                  )}
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {confirmAction === 'send' ? "Confirm Send Now" : "Send Now"}
                </button>
                <button
                  type="button"
                  onClick={handleApproveAndSchedule}
                  disabled={sending || stats.total === 0 || !selectedPostId}
                  className={cn(
                    "flex-1 py-2.5 rounded-lg flex items-center justify-center gap-2 font-medium shadow-sm transition-all duration-200",
                    confirmAction === 'schedule'
                      ? "bg-orange-500 hover:bg-orange-600 text-white ring-4 ring-orange-100 animate-pulse"
                      : "bg-green-600 hover:bg-green-700 text-white"
                  )}
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                  {confirmAction === 'schedule' ? "Confirm Schedule" : "Approve & Schedule"}
                </button>
              </div>
              {stats.total === 0 && (
                <p className="text-xs text-center text-gray-500">No audience members yet. Import CSV above.</p>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Audience & History Tabs */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-[600px]">
          <div className="flex border-b border-gray-200 bg-gray-50">
            <button
              onClick={() => setActiveTab('leads')}
              className={`flex-1 py-3 text-sm font-medium border-b-2 text-center flex items-center justify-center gap-2 ${activeTab === 'leads' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
            >
              <Users className="w-4 h-4" /> Audience ({leads.length})
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`flex-1 py-3 text-sm font-medium border-b-2 text-center flex items-center justify-center gap-2 ${activeTab === 'history' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
            >
              <History className="w-4 h-4" /> Email History ({publishedPosts.length})
            </button>
          </div>
          <div className="p-2 border-b border-gray-100 bg-white flex justify-end">
            <button onClick={fetchLeads} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium px-2">Refresh Data</button>
          </div>

          <div className="overflow-y-auto flex-1 p-0">
            {activeTab === 'leads' ? (
              loading ? (
                <div className="flex justify-center items-center h-40">
                  <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
                </div>
              ) : leads.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  No audience found. Upload a CSV to get started.
                </div>
              ) : (
                <table className="w-full text-sm text-left">
                  <thead className="bg-gray-50 text-gray-500 sticky top-0">
                    <tr>
                      <th className="px-4 py-3 font-medium">Email</th>
                      <th className="px-4 py-3 font-medium">Name</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Sent At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {leads.map(lead => (
                      <tr key={lead.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-900">{lead.email}</td>
                        <td className="px-4 py-3 text-gray-500">{lead.name || '-'}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${lead.status === 'SENT' ? 'bg-green-100 text-green-700' :
                            lead.status === 'FAILED' ? 'bg-red-100 text-red-700' :
                              'bg-gray-100 text-gray-700'
                            }`}>
                            {lead.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-400 text-xs">
                          {lead.sent_at ? format(parseSqliteDate(lead.sent_at), 'MMM d, h:mm a') : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            ) : (
              /* History Tab */
              publishedPosts.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  No email history found for this campaign.
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {publishedPosts.map(post => {
                    const parsedData = parseCaption(post.caption);
                    const subject = parsedData.subject || "No Subject";

                    return (
                      <div key={post.id} className="p-4 hover:bg-gray-50 transition-colors">
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="font-medium text-gray-900 line-clamp-1">{subject}</h4>
                          <span className="text-xs text-green-700 bg-green-100 px-2 py-0.5 rounded-full whitespace-nowrap flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" /> Sent
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-500 mb-3">
                          <Clock className="w-3 h-3" />
                          {format(parseSqliteDate(post.created_at || post.scheduled_at), 'MMM d, yyyy h:mm a')}
                        </div>
                        <details className="text-sm">
                          <summary className="text-indigo-600 cursor-pointer hover:text-indigo-800 font-medium text-xs">View Original Content</summary>
                          <div className="mt-3 p-3 bg-gray-50 rounded border border-gray-200 text-gray-700 prose prose-sm max-w-none">
                            {parsedData.body ? (
                              <div dangerouslySetInnerHTML={{ __html: parsedData.body.replace(/\n/g, '<br/>') }} />
                            ) : (
                              <span className="italic">Manual Email Dispatch</span>
                            )}
                          </div>
                        </details>
                      </div>
                    );
                  })}
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
