import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Layout, Play, CheckCircle, Clock, ExternalLink, Loader2, AlertCircle, Plus, Image as ImageIcon, Briefcase, X, Trash2, Calendar, List, Grid, Sparkles, Users, Settings } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from './lib/utils';
import CalendarView from './CalendarView';
import LeadsManager from './LeadsManager';
import PostDetailModal from './PostDetailModal';
import { parseImageUrls, parseCaption, parseSqliteDate } from './postUtils';
import SplashScreen from './SplashScreen';
import SettingsScreen from './SettingsScreen';

// API Configuration
const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';
const API_KEY = import.meta.env.VITE_API_KEY || 'dev-secret-key-123';

// Configure global axios defaults
axios.defaults.baseURL = API_URL;
axios.defaults.headers.common['X-API-Key'] = API_KEY;

// Error Boundary Component
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ error, errorInfo });
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 bg-red-50 border border-red-200 rounded-lg text-red-900">
          <h2 className="text-lg font-bold mb-2 flex items-center gap-2">
            <AlertCircle className="w-5 h-5" /> Something went wrong.
          </h2>
          <details className="whitespace-pre-wrap text-sm font-mono bg-white p-4 rounded border border-red-100">
            {this.state.error && this.state.error.toString()}
            <br />
            {this.state.errorInfo && this.state.errorInfo.componentStack}
          </details>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// --- Brand Management Component ---
function BrandManager({ onBack }) {
  const [url, setUrl] = useState("");
  const [brandContext, setBrandContext] = useState(""); // New: Text context
  const [logoUrl, setLogoUrl] = useState(null); // New: Logo URL
  const [isUploadingLogo, setIsUploadingLogo] = useState(false); // New: Logo upload state

  const [loading, setLoading] = useState(false);
  const [generatedDNA, setGeneratedDNA] = useState(null);

  // Editable DNA State
  const [dnaVoice, setDnaVoice] = useState("");
  const [dnaAudience, setDnaAudience] = useState("");
  const [dnaStyle, setDnaStyle] = useState("");

  const [brandName, setBrandName] = useState("");
  const [brands, setBrands] = useState([]);
  const [selectedBrandId, setSelectedBrandId] = useState(null); // Track selected brand

  useEffect(() => {
    fetchBrands();
  }, []);

  const fetchBrands = async () => {
    try {
      const res = await axios.get("/brands");
      setBrands(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      console.error("Failed to fetch brands", e);
      setBrands([]);
    }
  };

  const handleBrandClick = (brand) => {
    setSelectedBrandId(brand.id);
    setUrl(brand.website_url || "");
    setBrandContext(brand.identity_description || "");
    setLogoUrl(brand.logo_url || null);
    setGeneratedDNA(brand.brand_dna || null);

    if (brand.brand_dna) {
      setDnaVoice(brand.brand_dna.voice || "");
      setDnaAudience(brand.brand_dna.audience || "");
      setDnaStyle(brand.brand_dna.style || "");
    }
    setBrandName(brand.name || "");
  };

  const handleFileUpload = async (file) => {
    if (!file) return;
    setIsUploadingLogo(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await axios.post("/upload", formData);
      setLogoUrl(res.data.url);
    } catch (e) {
      console.error("Logo upload failed", e);
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const analyzeBrand = async () => {
    if (!url && !brandContext) return;
    setLoading(true);
    setGeneratedDNA(null);
    try {
      const res = await axios.post("/brands/generate", {
        url: url,
        brand_context: brandContext
      });
      setGeneratedDNA(res.data);
      setDnaVoice(res.data.voice);
      setDnaAudience(res.data.audience);
      setDnaStyle(res.data.style);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const saveBrand = async () => {
    if (!brandName || !generatedDNA) return;
    try {
      if (selectedBrandId) {
        // Update
        await axios.put(`/brands/${selectedBrandId}`, {
          name: brandName,
          website_url: url,
          logo_url: logoUrl,
          identity_description: brandContext,
          brand_dna: {
            voice: dnaVoice,
            audience: dnaAudience,
            style: dnaStyle
          }
        });
      } else {
        // Create
        await axios.post("/brands", {
          name: brandName,
          website_url: url,
          logo_url: logoUrl,
          identity_description: brandContext,
          brand_dna: {
            voice: dnaVoice,
            audience: dnaAudience,
            style: dnaStyle
          }
        });
      }
      fetchBrands();
      // Reset
      setSelectedBrandId(null);
      setBrandName("");
      setUrl("");
      setLogoUrl(null);
      setBrandContext("");
      setGeneratedDNA(null);
    } catch (e) {
      console.error(e);
    }
  };

  const deleteBrand = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm("Delete this brand?")) return;
    try {
      await axios.delete(`/brands/${id}`);
      fetchBrands();
      if (selectedBrandId === id) {
        setSelectedBrandId(null);
        setBrandName("");
        setUrl("");
        setLogoUrl(null);
        setBrandContext("");
        setGeneratedDNA(null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Brand Identity Manager</h2>
          <p className="text-gray-500 text-sm mt-1">Define your brand's DNA to guide AI content generation.</p>
        </div>
        <button
          onClick={onBack}
          className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200"
        >
          Back to Campaigns
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Sidebar: Brand List */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900">Your Brands</h3>
              <button
                onClick={() => {
                  setSelectedBrandId(null);
                  setBrandName("");
                  setUrl("");
                  setLogoUrl(null);
                  setBrandContext("");
                  setGeneratedDNA(null);
                }}
                className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                title="New Brand"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 max-h-[600px] overflow-auto pr-2">
              {brands.map(brand => (
                <div
                  key={brand.id}
                  onClick={() => handleBrandClick(brand)}
                  className={cn(
                    "group flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer",
                    selectedBrandId === brand.id
                      ? "bg-indigo-50 border-indigo-200 ring-1 ring-indigo-200"
                      : "bg-white border-gray-100 hover:border-indigo-100 hover:bg-gray-50"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden border border-gray-200">
                      {brand.logo_url ? (
                        <img src={brand.logo_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <Briefcase className="w-5 h-5 text-gray-400" />
                      )}
                    </div>
                    <div>
                      <p className={cn("text-sm font-bold", selectedBrandId === brand.id ? "text-indigo-900" : "text-gray-900")}>
                        {brand.name}
                      </p>
                      <p className="text-[10px] text-gray-500 truncate max-w-[120px]">
                        {brand.website_url || "No website"}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={(e) => deleteBrand(brand.id, e)}
                    className="p-1.5 text-gray-300 hover:text-red-500 rounded-lg hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {brands.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-400">No brands saved yet.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Main Content: Analysis & Editor */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm">
            <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-600" />
              {selectedBrandId ? "Edit Brand Identity" : "Brand Discovery"}
            </h3>

            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Brand Name</label>
                  <input
                    type="text"
                    value={brandName}
                    onChange={(e) => setBrandName(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-gray-50/50"
                    placeholder="E.g., Acme Corp"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Website URL</label>
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-gray-50/50"
                    placeholder="https://..."
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">About the Brand (Identity & Context)</label>
                <textarea
                  value={brandContext}
                  onChange={(e) => setBrandContext(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-gray-50/50 h-32 resize-none"
                  placeholder="Describe your brand's mission, products, or unique value proposition..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Brand Logo</label>
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden">
                    {logoUrl ? (
                      <img src={logoUrl} alt="Logo preview" className="w-full h-full object-cover" />
                    ) : (
                      <ImageIcon className="w-6 h-6 text-gray-300" />
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleFileUpload(e.target.files[0])}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    />
                    <button className="px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors flex items-center gap-2">
                      {isUploadingLogo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                      Upload Logo
                    </button>
                  </div>
                  {logoUrl && (
                    <button
                      onClick={() => setLogoUrl(null)}
                      className="text-xs text-red-500 hover:underline"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 pt-4">
                <button
                  onClick={analyzeBrand}
                  disabled={loading || (!url && !brandContext)}
                  className="flex-1 bg-gray-900 text-white font-bold py-3 rounded-xl hover:bg-gray-800 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-sm"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5 text-indigo-400" />}
                  Generate Brand DNA
                </button>
              </div>
            </div>
          </div>

          {(generatedDNA || selectedBrandId) && (
            <div className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm space-y-8 animate-in slide-in-from-top-4 duration-300">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-900">Refine Brand DNA</h3>
                <span className="px-3 py-1 bg-green-50 text-green-700 text-xs font-bold rounded-full border border-green-100">
                  Ready to use
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Voice & Tone</label>
                  <textarea
                    value={dnaVoice}
                    onChange={(e) => setDnaVoice(e.target.value)}
                    className="w-full border border-gray-100 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-indigo-50/30 h-32 resize-none"
                    placeholder="Professional, witty, bold..."
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Target Audience</label>
                  <textarea
                    value={dnaAudience}
                    onChange={(e) => setDnaAudience(e.target.value)}
                    className="w-full border border-gray-100 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-indigo-50/30 h-32 resize-none"
                    placeholder="Early adopters, tech-savvy..."
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Visual Style</label>
                  <textarea
                    value={dnaStyle}
                    onChange={(e) => setDnaStyle(e.target.value)}
                    className="w-full border border-gray-100 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-indigo-50/30 h-32 resize-none"
                    placeholder="Minimalist, neon, retro..."
                  />
                </div>
              </div>

              <div className="pt-4 flex gap-4">
                <button
                  onClick={saveBrand}
                  disabled={!brandName}
                  className="flex-1 bg-indigo-600 text-white font-bold py-4 rounded-xl hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100 active:scale-95 flex items-center justify-center gap-2"
                >
                  <CheckCircle className="w-5 h-5" />
                  Save Brand Setup
                </button>
                <button
                  onClick={() => {
                    setSelectedBrandId(null);
                    setBrandName("");
                    setUrl("");
                    setLogoUrl(null);
                    setBrandContext("");
                    setGeneratedDNA(null);
                  }}
                  className="px-6 py-4 text-sm font-medium text-gray-500 border border-gray-100 rounded-xl hover:bg-gray-50 transition-colors"
                >
                  Discard
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [setupComplete, setSetupComplete] = useState(null); // null = loading
  const [view, setView] = useState("campaigns"); // 'campaigns' or 'brands'

  // Data States
  const [campaigns, setCampaigns] = useState([]);
  const [brands, setBrands] = useState([]);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [selectedBrandId, setSelectedBrandId] = useState("");
  const [posts, setPosts] = useState([]);

  // UI States
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(null);
  const [error, setError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [lightboxImage, setLightboxImage] = useState(null);
  const [viewMode, setViewMode] = useState('list');
  const [selectedPostForModal, setSelectedPostForModal] = useState(null);

  // Forms
  const [newCampaignName, setNewCampaignName] = useState("");
  const [newCampaignPrompt, setNewCampaignPrompt] = useState("");
  const [newPostPrompt, setNewPostPrompt] = useState("");
  const [newPostType, setNewPostType] = useState("POST");
  const [newPostCount, setNewPostCount] = useState(1);
  const [uploadedImageUrl, setUploadedImageUrl] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [useAsContent, setUseAsContent] = useState(false);

  // --- Effects ---
  useEffect(() => {
    axios.get("/config/status")
      .then(res => setSetupComplete(res.data.setup_complete))
      .catch(() => setSetupComplete(false));
    fetchCampaigns();
    axios.get("/brands").then(res => setBrands(res.data)).catch(console.error);
  }, []);

  useEffect(() => {
    if (selectedCampaign) {
      setViewMode('list');
      fetchPosts(selectedCampaign.id);
    } else {
      setPosts([]);
    }
  }, [selectedCampaign]);

  // Auto-refresh posts while any are still PENDING
  useEffect(() => {
    const hasPending = posts.some(p => p.status === 'PENDING');
    if (!hasPending || !selectedCampaign) return;
    const timer = setTimeout(() => fetchPosts(selectedCampaign.id), 5000);
    return () => clearTimeout(timer);
  }, [posts, selectedCampaign]);

  const fetchCampaigns = async () => {
    try {
      const res = await axios.get("/campaigns");
      setCampaigns(res.data);
    } catch (e) {
      console.error(e);
      setError("Failed to fetch campaigns");
    }
  };

  const fetchPosts = async (campId) => {
    setProcessing('refresh');
    try {
      const res = await axios.get(`/campaigns/${campId}/posts`);
      setPosts(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      console.error(e);
    } finally {
      setProcessing(null);
    }
  };

  const createCampaign = async () => {
    if (!newCampaignName || !newCampaignPrompt) return;
    try {
      const res = await axios.post("/campaigns", {
        name: newCampaignName,
        master_prompt: newCampaignPrompt,
        brand_id: selectedBrandId ? parseInt(selectedBrandId) : null
      });
      setCampaigns([...campaigns, res.data]);
      setModalOpen(false);
      setNewCampaignName("");
      setNewCampaignPrompt("");
      setSelectedBrandId("");
    } catch (e) {
      console.error(e);
    }
  };

  const deleteCampaign = async (id) => {
    if (!window.confirm("Delete this campaign?")) return;
    try {
      await axios.delete(`/campaigns/${id}`);
      setCampaigns(campaigns.filter(c => c.id !== id));
      if (selectedCampaign?.id === id) setSelectedCampaign(null);
    } catch (e) {
      console.error(e);
    }
  };

  const createPost = async (campId) => {
    if (!newPostPrompt) return;
    setProcessing('post');
    try {
      await axios.post(`/campaigns/${campId}/posts`, {
        specific_prompt: newPostPrompt,
        type: newPostType,
        image_count: newPostType === "POST" ? newPostCount : 1,
        input_image_url: uploadedImageUrl,
        use_as_content: useAsContent
      });
      fetchPosts(campId);
      setNewPostPrompt("");
      setUploadedImageUrl(null);
      setUseAsContent(false);
    } catch (e) {
      console.error(e);
    } finally {
      setProcessing(null);
    }
  };

  const deletePost = async (id) => {
    if (!window.confirm("Delete this post?")) return;
    try {
      await axios.delete(`/posts/${id}`);
      setPosts(posts.filter(p => p.id !== id));
    } catch (e) {
      console.error(e);
    }
  };

  const handleFileUpload = async (file) => {
    if (!file) return;
    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await axios.post("/upload", formData);
      setUploadedImageUrl(res.data.url);
    } catch (e) {
      console.error("Upload failed", e);
    } finally {
      setIsUploading(false);
    }
  };

  const handlePostClick = (post) => {
    setSelectedPostForModal(post);
  };

  if (showSplash) {
    return <SplashScreen onFinished={() => setShowSplash(false)} />;
  }

  if (setupComplete === false) {
    return <SettingsScreen onComplete={() => setSetupComplete(true)} />;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      <div className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Layout className="w-6 h-6 text-indigo-600" />
                <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600">
                  Content Automation Engine
                </h1>
              </div>
              <p className="text-gray-500">Automate your brand's presence with AI-generated posts and email reach.</p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setSetupComplete(false)}
                title="Settings"
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all shadow-sm"
              >
                <Settings className="w-4 h-4" />
              </button>
              <button
                onClick={() => setView(view === "campaigns" ? "brands" : "campaigns")}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all shadow-sm"
              >
                {view === "campaigns" ? <Briefcase className="w-4 h-4" /> : <List className="w-4 h-4" />}
                {view === "campaigns" ? "Manage Brands" : "Back to Campaigns"}
              </button>

              <button
                onClick={() => setModalOpen(true)}
                className="flex items-center gap-2 px-6 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100 hover:shadow-indigo-200"
              >
                <Plus className="w-4 h-4" />
                New Campaign
              </button>
            </div>
          </div>

          <ErrorBoundary>
            {view === "brands" ? (
              <BrandManager onBack={() => setView("campaigns")} />
            ) : selectedCampaign ? (
              <div className="space-y-8">
                {/* Back Link */}
                <button
                  onClick={() => setSelectedCampaign(null)}
                  className="group flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-indigo-600 transition-colors"
                >
                  <X className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
                  Back to Campaigns
                </button>

                {/* Campaign Detail Header */}
                <div className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm">
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                    <div className="max-w-2xl">
                      <h2 className="text-2xl font-bold text-gray-900 mb-2">{selectedCampaign.name}</h2>
                      <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                        <p className="text-sm font-medium text-gray-500 mb-1 flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5" /> Campaign Strategy
                        </p>
                        <p className="text-gray-700 text-sm leading-relaxed">{selectedCampaign.master_prompt}</p>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => fetchPosts(selectedCampaign.id)}
                        className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        <Loader2 className={cn("w-4 h-4", processing === 'refresh' && "animate-spin")} />
                        Refresh Dashboard
                      </button>
                    </div>
                  </div>
                </div>

                {/* Tab Controls Style Content */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-gray-200 pb-2">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setViewMode('list')}
                      className={cn(
                        "px-4 py-2 text-sm font-medium transition-all relative",
                        viewMode === 'list' ? "text-indigo-600" : "text-gray-500 hover:text-gray-700"
                      )}
                    >
                      Posts List
                      {viewMode === 'list' && <div className="absolute bottom-[-9px] left-0 right-0 h-0.5 bg-indigo-600 rounded-full" />}
                    </button>
                    <button
                      onClick={() => setViewMode('calendar')}
                      className={cn(
                        "px-4 py-2 text-sm font-medium transition-all relative",
                        viewMode === 'calendar' ? "text-indigo-600" : "text-gray-500 hover:text-gray-700"
                      )}
                    >
                      Calendar View
                      {viewMode === 'calendar' && <div className="absolute bottom-[-9px] left-0 right-0 h-0.5 bg-indigo-600 rounded-full" />}
                    </button>
                    <button
                      onClick={() => setViewMode('leads')}
                      className={cn(
                        "px-4 py-2 text-sm font-medium transition-all relative",
                        viewMode === 'leads' ? "text-indigo-600" : "text-gray-500 hover:text-gray-700"
                      )}
                    >
                      Leads & Outreach
                      {viewMode === 'leads' && <div className="absolute bottom-[-9px] left-0 right-0 h-0.5 bg-indigo-600 rounded-full" />}
                    </button>
                  </div>
                </div>

                {/* Conditional Content Views */}
                {viewMode === 'calendar' ? (
                  <CalendarView posts={posts} selectedCampaign={selectedCampaign} onPostClick={handlePostClick} />
                ) : viewMode === 'leads' ? (
                  <LeadsManager campaignId={selectedCampaign.id} posts={posts} />
                ) : (
                  <>
                    <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                      <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                        Campaign Content
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs font-medium rounded-full">
                          {posts.length} Items
                        </span>
                      </h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {/* Generative UI Card */}
                      <div className="col-span-1 bg-gradient-to-br from-indigo-50 to-white rounded-2xl border-2 border-dashed border-indigo-200 p-6 flex flex-col items-center justify-center text-center group hover:border-indigo-300 transition-all">
                        <div className="w-12 h-12 bg-white rounded-xl shadow-sm flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                          <Plus className="w-6 h-6 text-indigo-600" />
                        </div>
                        <h4 className="font-semibold text-gray-900 mb-1">Generate New Post</h4>
                        <p className="text-sm text-gray-500 mb-6">Create AI content for this campaign</p>

                        <div className="w-full space-y-4">
                          <textarea
                            value={newPostPrompt}
                            onChange={(e) => setNewPostPrompt(e.target.value)}
                            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 min-h-[100px] resize-none bg-white shadow-inner"
                            placeholder="What should this specific post be about? (e.g., 'A motivational quote about persistence')"
                          />

                          <div className="flex flex-col gap-3">
                            <div className="flex items-center justify-between text-xs px-1">
                              <span className="font-medium text-gray-700">Images to Generate:</span>
                              <span className="text-indigo-600 font-bold">{newPostCount}</span>
                            </div>
                            <input
                              type="range"
                              min="1"
                              max="4"
                              value={newPostCount}
                              onChange={(e) => setNewPostCount(parseInt(e.target.value))}
                              className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                            />
                          </div>

                          <div className="space-y-3">
                            {/* Content Type Toggle */}
                            <div className="flex bg-gray-100 p-1 rounded-lg">
                              <button
                                onClick={() => setNewPostType("POST")}
                                className={cn("flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all", newPostType === "POST" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500")}
                              >Post</button>
                              <button
                                onClick={() => setNewPostType("NEWSLETTER")}
                                className={cn("flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all", newPostType === "NEWSLETTER" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500")}
                              >Newsletter</button>
                            </div>

                            {/* Reference Image Upload */}
                            {!uploadedImageUrl ? (
                              <div className="relative">
                                <input
                                  type="file"
                                  accept="image/*"
                                  onChange={(e) => handleFileUpload(e.target.files[0])}
                                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                />
                                <div className="flex items-center justify-center gap-2 py-2 px-4 border border-gray-200 rounded-lg bg-white text-sm text-gray-600">
                                  {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                                  Reference Image
                                </div>
                              </div>
                            ) : (
                              <div className="relative group">
                                <img src={uploadedImageUrl} className="w-full h-24 object-cover rounded-lg border border-gray-200" />
                                <button
                                  onClick={() => setUploadedImageUrl(null)}
                                  className="absolute top-1 right-1 p-1 bg-white/80 rounded-full text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                                <div className="mt-2 flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    id="useAsContent"
                                    checked={useAsContent}
                                    onChange={(e) => setUseAsContent(e.target.checked)}
                                    className="rounded text-indigo-600"
                                  />
                                  <label htmlFor="useAsContent" className="text-xs text-gray-600">Use this image directly (no generation)</label>
                                </div>
                              </div>
                            )}

                            <button
                              onClick={() => createPost(selectedCampaign.id)}
                              disabled={!newPostPrompt || processing === 'post'}
                              className="w-full bg-indigo-600 text-white font-medium py-3 rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm flex items-center justify-center gap-2"
                            >
                              {processing === 'post' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                              Generate Content
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Post Cards */}
                      {posts.map((post) => (
                        <div
                          key={post.id}
                          className="group bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm hover:shadow-md transition-all"
                        >
                          <div className="aspect-square bg-gray-50 relative overflow-hidden flex items-center justify-center">
                            {post.status === 'PENDING' ? (
                              <div className="flex flex-col items-center gap-3 animate-pulse">
                                <span className="w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center">
                                  <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
                                </span>
                                <span className="text-xs font-semibold text-indigo-600 uppercase tracking-wider">Generating...</span>
                              </div>
                            ) : parseImageUrls(post.image_urls).length > 0 ? (
                              <img
                                src={parseImageUrls(post.image_urls)[0]}
                                alt="Generated"
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 cursor-zoom-in"
                                onClick={() => setLightboxImage(parseImageUrls(post.image_urls)[0])}
                              />
                            ) : (
                              <div className="flex flex-col items-center gap-2 text-gray-300">
                                <ImageIcon className="w-10 h-10" />
                                <span className="text-xs font-medium">No Image</span>
                              </div>
                            )}

                            {/* Badge */}
                            <div className="absolute top-4 left-4">
                              <span className={cn(
                                "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider shadow-sm",
                                post.status === 'PUBLISHED' ? "bg-green-100 text-green-700" :
                                  post.status === 'FAILED' ? "bg-red-100 text-red-700" :
                                    post.status === 'APPROVED' ? "bg-amber-100 text-amber-700" :
                                      "bg-indigo-100 text-indigo-700"
                              )}>
                                {post.status}
                              </span>
                            </div>

                            <button
                              onClick={() => deletePost(post.id)}
                              className="absolute top-4 right-4 p-2 bg-white/90 rounded-xl text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all shadow-sm"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>

                            {/* Type Badge */}
                            <div className="absolute bottom-4 left-4">
                              <span className="bg-black/40 backdrop-blur-md text-white text-[10px] font-bold px-2 py-1 rounded-md uppercase">
                                {post.type || "POST"}
                              </span>
                            </div>
                          </div>

                          <div className="p-5">
                            <div className="flex items-center gap-1.5 mb-3">
                              <Clock className="w-3.5 h-3.5 text-gray-400" />
                              <span className="text-xs font-medium text-gray-400 italic">
                                {post.scheduled_at ? `Scheduled for ${format(parseSqliteDate(post.scheduled_at), 'MMM d, h:mm a')}` : 'Not scheduled'}
                              </span>
                            </div>

                            <p className="text-sm text-gray-600 line-clamp-3 mb-5 leading-relaxed bg-gray-50/50 p-2 rounded-lg border border-gray-100/50">
                              {(() => { const c = parseCaption(post.caption); return c.isNewsletter ? c.subject || c.body : c.raw; })()}
                            </p>

                            <div className="flex gap-2">
                              <button
                                onClick={() => handlePostClick(post)}
                                className="flex-1 px-4 py-2.5 bg-gray-900 text-white font-medium rounded-xl hover:bg-gray-800 transition-all text-sm flex items-center justify-center gap-2"
                              >
                                {post.status === 'PUBLISHED' ? 'View Details' : 'Preview & Edit'}
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">Recent Campaigns</h3>
                </div>

                {campaigns.length === 0 ? (
                  <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-200">
                    <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                      <Layout className="w-8 h-8 text-indigo-400" />
                    </div>
                    <h4 className="text-gray-900 font-semibold">No campaigns yet</h4>
                    <p className="text-gray-500 text-sm mt-1 mb-8">Start by creating your first content strategy.</p>
                    <button
                      onClick={() => setModalOpen(true)}
                      className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-all shadow-md"
                    >
                      <Plus className="w-4 h-4" />
                      Create your first Campaign
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {campaigns.map((camp) => (
                      <div
                        key={camp.id}
                        onClick={() => setSelectedCampaign(camp)}
                        className="group bg-white rounded-2xl border border-gray-100 p-6 shadow-sm hover:shadow-lg hover:border-indigo-100 transition-all cursor-pointer relative"
                      >
                        <div className="flex items-center justify-between mb-4">
                          <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                            <Layout className="w-5 h-5 text-indigo-600" />
                          </div>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteCampaign(camp.id);
                            }}
                            className="p-1.5 text-gray-300 hover:text-red-500 rounded-lg hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        <h4 className="font-bold text-gray-900 group-hover:text-indigo-600 transition-colors mb-2">{camp.name}</h4>
                        <p className="text-sm text-gray-500 line-clamp-2 mb-6 leading-relaxed">
                          {camp.master_prompt}
                        </p>

                        <div className="flex items-center justify-between pt-4 border-t border-gray-50">
                          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
                            <Clock className="w-3 h-3" />
                            {format(parseSqliteDate(camp.created_at), 'MMM d, yyyy')}
                          </span>
                          <span className="text-xs font-semibold text-indigo-600 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            Open <ExternalLink className="w-3 h-3" />
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </ErrorBoundary>
        </div>

        {/* Campaign Creation Modal */}
        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setModalOpen(false)}></div>
            <div className="relative bg-white rounded-2xl w-full max-w-md p-8 shadow-2xl animate-in zoom-in-95 duration-200">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <Plus className="w-5 h-5 text-indigo-600" /> Create Campaign
                </h3>
                <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={(e) => { e.preventDefault(); createCampaign(); }} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Campaign Name</label>
                  <input
                    required
                    type="text"
                    value={newCampaignName}
                    onChange={(e) => setNewCampaignName(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                    placeholder="E.g., Winter Sale 2024"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Brand Identity</label>
                  <select
                    value={selectedBrandId}
                    onChange={(e) => setSelectedBrandId(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                  >
                    <option value="">-- No Brand --</option>
                    {(brands || []).map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">Campaign will inherit brand voice and visual style.</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Master Strategy / Objective</label>
                  <textarea
                    required
                    value={newCampaignPrompt}
                    onChange={(e) => setNewCampaignPrompt(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 h-24 resize-none"
                    placeholder="Describe the high-level goal, target audience across all posts..."
                  />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg"
                  >
                    Create Campaign
                  </button>
                </div>
              </form>
            </div>
          </div>
        )
        }

        {/* Lightbox Modal */}
        {lightboxImage && (
          <div
            className="fixed inset-0 z-[60] bg-black/95 flex items-center justify-center p-4 animate-in fade-in duration-200"
            onClick={() => setLightboxImage(null)}
          >
            <button
              onClick={() => setLightboxImage(null)}
              className="absolute top-4 right-4 text-white hover:text-gray-300 p-2"
            >
              <X className="w-8 h-8" />
            </button>
            <img
              src={lightboxImage}
              alt="Fullscreen view"
              className="max-w-full max-h-screen object-contain rounded-lg shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )
        }
      </div>

      <PostDetailModal
        post={selectedPostForModal}
        campaignId={selectedCampaign?.id}
        onClose={() => setSelectedPostForModal(null)}
        onUpdate={(updatedPost) => {
          setPosts(prev => prev.map(p => p.id === updatedPost.id ? updatedPost : p));
          fetchCampaigns(); // To update status in campaign list if needed
        }}
      />
    </div>
  );
}

export default App;
