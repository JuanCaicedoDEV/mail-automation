import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Settings, Key, Mail, Globe, Eye, EyeOff, CheckCircle, AlertCircle, Loader2, ExternalLink, Save } from 'lucide-react';

const FIELD_META = {
  gemini_api_key: {
    label: 'Gemini API Key',
    placeholder: 'AIza...',
    hint: 'From Google AI Studio → Get API Key',
    link: 'https://aistudio.google.com/app/apikey',
    secret: true,
    required: true,
  },
  google_client_id: {
    label: 'Zoho Client ID',
    placeholder: '1000.XXXXXXXXXXXXXXXXXXXX',
    hint: 'From Zoho Developer Console → Self Client or Server-based App',
    link: 'https://api-console.zoho.com',
    secret: false,
    required: false,
  },
  google_client_secret: {
    label: 'Zoho Client Secret',
    placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    hint: 'From the same app entry in Zoho Developer Console',
    secret: true,
    required: false,
  },
  zoho_email: {
    label: 'Zoho Sender Email',
    placeholder: 'you@yourdomain.com',
    hint: 'The email address that will appear in the From field',
    secret: false,
    required: false,
  },
  gmail_user: {
    label: 'Gmail Address (SMTP fallback)',
    placeholder: 'you@gmail.com',
    hint: 'Used only if OAuth is not configured',
    secret: false,
    required: false,
  },
  gmail_app_password: {
    label: 'Gmail App Password (SMTP fallback)',
    placeholder: 'xxxx xxxx xxxx xxxx',
    hint: 'Google Account → Security → App Passwords',
    link: 'https://myaccount.google.com/apppasswords',
    secret: true,
    required: false,
  },
};

function Field({ name, value, onChange, showSecrets, onToggleSecret }) {
  const meta = FIELD_META[name];
  if (!meta) return null;
  const isSecret = meta.secret;

  return (
    <div className="mb-5">
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {meta.label}
        {meta.required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <div className="relative">
        <input
          type={isSecret && !showSecrets ? 'password' : 'text'}
          value={value}
          onChange={e => onChange(name, e.target.value)}
          placeholder={value ? '' : meta.placeholder}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
        />
        {isSecret && (
          <button
            type="button"
            onClick={() => onToggleSecret(name)}
            className="absolute right-2 top-2 text-gray-400 hover:text-gray-600"
            tabIndex={-1}
          >
            {showSecrets ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
      </div>
      <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
        {meta.hint}
        {meta.link && (
          <a href={meta.link} target="_blank" rel="noreferrer" className="text-indigo-500 hover:underline inline-flex items-center gap-0.5">
            <ExternalLink className="w-3 h-3" /> Open
          </a>
        )}
      </p>
    </div>
  );
}

export default function SettingsScreen({ onComplete, isModal = false }) {
  const [fields, setFields] = useState({
    gemini_api_key: '',
    google_client_id: '',
    google_client_secret: '',
    zoho_email: '',
    gmail_user: '',
    gmail_app_password: '',
  });
  const [showSecrets, setShowSecrets] = useState({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [gmailStatus, setGmailStatus] = useState({ connected: false, email: null });
  const [connectingGmail, setConnectingGmail] = useState(false);
  const [oauthRedirectUri] = useState('http://127.0.0.1:8000/auth/zoho/callback');

  useEffect(() => {
    // Load existing (masked) config
    axios.get('/config').then(res => {
      setFields(prev => ({
        ...prev,
        google_client_id: res.data.google_client_id || '',
        zoho_email: res.data.zoho_email || '',
        gmail_user: res.data.gmail_user || '',
        // Secrets come back masked — don't pre-fill, user must re-enter to change
      }));
    }).catch(() => {});

    // Check Gmail OAuth status
    axios.get('/auth/status').then(res => {
      setGmailStatus(res.data);
    }).catch(() => {});

    // Handle OAuth callback redirect (?connected=true or ?error=...)
    const params = new URLSearchParams(window.location.search);
    if (params.get('connected') === 'true') {
      setGmailStatus({ connected: true, email: 'Connected' });
      window.history.replaceState({}, '', '/');
    }
    if (params.get('error')) {
      setError(`OAuth error: ${params.get('error')}`);
      window.history.replaceState({}, '', '/');
    }
  }, []);

  const handleChange = (name, value) => {
    setFields(prev => ({ ...prev, [name]: value }));
    setSaved(false);
    setError('');
  };

  const toggleSecret = name => {
    setShowSecrets(prev => ({ ...prev, [name]: !prev[name] }));
  };

  const handleSave = async () => {
    if (!fields.gemini_api_key) {
      setError('Gemini API Key is required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      // Only send non-empty fields so we don't accidentally clear stored secrets
      const payload = {};
      for (const [k, v] of Object.entries(fields)) {
        if (v) payload[k] = v;
      }
      const res = await axios.put('/config', payload);
      setSaved(true);
      if (res.data.setup_complete && onComplete) {
        setTimeout(onComplete, 800);
      }
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleConnectGmail = async () => {
    // Save OAuth credentials first
    if (!fields.google_client_id || !fields.google_client_secret) {
      setError('Enter Zoho Client ID and Client Secret before connecting Zoho.');
      return;
    }
    setConnectingGmail(true);
    try {
      const payload = {
        google_client_id: fields.google_client_id,
        google_client_secret: fields.google_client_secret,
      };
      await axios.put('/config', payload);
      const res = await axios.get('/auth/zoho/login');
      window.location.href = res.data.url;
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to start OAuth flow.');
      setConnectingGmail(false);
    }
  };

  const wrapper = isModal
    ? 'bg-white rounded-2xl shadow-xl p-8 w-full max-w-xl'
    : 'min-h-screen bg-gray-50 flex items-center justify-center p-6';

  const inner = (
    <div className={isModal ? '' : 'bg-white rounded-2xl shadow-xl p-8 w-full max-w-xl'}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="bg-indigo-100 p-2 rounded-lg">
          <Settings className="w-6 h-6 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Configuration</h1>
          <p className="text-sm text-gray-500">Enter your API credentials to get started</p>
        </div>
      </div>

      {/* Section: AI */}
      <div className="mb-6">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Key className="w-3.5 h-3.5" /> AI Generation
        </h2>
        <Field name="gemini_api_key" value={fields.gemini_api_key}
          onChange={handleChange}
          showSecrets={!!showSecrets.gemini_api_key}
          onToggleSecret={toggleSecret} />
      </div>

      {/* Section: Zoho OAuth */}
      <div className="mb-6">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Mail className="w-3.5 h-3.5" /> Zoho Mail (OAuth2)
        </h2>

        <Field name="google_client_id" value={fields.google_client_id}
          onChange={handleChange}
          showSecrets={!!showSecrets.google_client_id}
          onToggleSecret={toggleSecret} />
        <Field name="google_client_secret" value={fields.google_client_secret}
          onChange={handleChange}
          showSecrets={!!showSecrets.google_client_secret}
          onToggleSecret={toggleSecret} />
        <Field name="zoho_email" value={fields.zoho_email}
          onChange={handleChange}
          showSecrets={false}
          onToggleSecret={() => {}} />

        {/* Redirect URI read-only */}
        <div className="mb-4 bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs">
          <p className="font-medium text-gray-600 mb-1 flex items-center gap-1">
            <Globe className="w-3.5 h-3.5" /> Authorized Redirect URI — add this in Zoho Developer Console:
          </p>
          <code className="text-indigo-700 font-mono select-all">{oauthRedirectUri}</code>
        </div>

        {gmailStatus.connected ? (
          <div className="flex items-center gap-2 text-green-600 text-sm bg-green-50 rounded-lg px-3 py-2">
            <CheckCircle className="w-4 h-4" />
            Zoho connected{gmailStatus.email && gmailStatus.email !== 'Connected' ? `: ${gmailStatus.email}` : ''}
          </div>
        ) : (
          <button
            onClick={handleConnectGmail}
            disabled={connectingGmail}
            className="flex items-center gap-2 bg-white border border-gray-300 hover:border-indigo-400 text-gray-700 hover:text-indigo-700 px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50"
          >
            {connectingGmail ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
            Connect Zoho Account
          </button>
        )}
      </div>

      {/* Section: SMTP Fallback */}
      <div className="mb-6">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Mail className="w-3.5 h-3.5" /> SMTP Fallback (optional)
        </h2>
        <Field name="gmail_user" value={fields.gmail_user}
          onChange={handleChange}
          showSecrets={false}
          onToggleSecret={() => {}} />
        <Field name="gmail_app_password" value={fields.gmail_app_password}
          onChange={handleChange}
          showSecrets={!!showSecrets.gmail_app_password}
          onToggleSecret={toggleSecret} />
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm mb-4">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-60"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
        {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Settings'}
      </button>
    </div>
  );

  return isModal ? wrapper : <div className={wrapper}>{inner}</div>;
}
