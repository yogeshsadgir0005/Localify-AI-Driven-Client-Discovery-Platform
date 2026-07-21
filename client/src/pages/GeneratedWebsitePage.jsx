import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Maximize2, Monitor, Smartphone, Palette, Copy, Check, Code2, Bug, Save, X, Sparkles, ImagePlus } from 'lucide-react';
import api, { getErrorMessage } from '../utils/axios';
import toast from 'react-hot-toast';

const GeneratedWebsitePage = () => {
  const { placeId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [changingTheme, setChangingTheme] = useState(false);
  const [pages, setPages] = useState(null);
  const [device, setDevice] = useState('desktop');
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [newColor, setNewColor] = useState('#3B82F6');

  // Editor / bug-fix state
  const [panel, setPanel] = useState('none');   // 'none' | 'code' | 'bug'
  const [codeDraft, setCodeDraft] = useState('');
  const [savingCode, setSavingCode] = useState(false);
  const [bugText, setBugText] = useState('');
  const [bugImage, setBugImage] = useState(null); // downscaled data URL
  const [fixing, setFixing] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fetchWebsite = async () => {
      try {
        const { data } = await api.get(`/website/${placeId}`);
        if (data.success) setPages(data.pages);
      } catch (err) {
        toast.error('Could not load website or it does not exist.');
        navigate(`/business/${placeId}`);
      } finally {
        setLoading(false);
      }
    };
    fetchWebsite();
  }, [placeId, navigate]);

  const handleChangeTheme = async () => {
    if (!window.confirm('Changing the theme will cost 1 AI Generation Credit. Are you sure?')) return;
    setChangingTheme(true);
    setShowColorPicker(false);
    const toastId = toast.loading('Applying new theme... (takes ~15 seconds)');
    try {
      const { data } = await api.post(`/website/${placeId}/change-theme`, { color: newColor });
      setPages(data.website.pages);
      toast.success('Theme updated!', { id: toastId });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to change theme.'), { id: toastId });
    } finally {
      setChangingTheme(false);
    }
  };

  // Rewrite any business-photo proxy URL to THIS frontend's configured backend
  // origin, so images load even if the stored HTML baked in a stale/localhost
  // origin (older sites, env mismatch between generation host and viewer).
  const fixPhotoUrls = (html) => {
    if (!html) return html;
    const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
    const origin = apiBase.replace(/\/api\/?$/, '');
    return html.replace(/https?:\/\/[^/"'\s)]+\/api\/business\/photo/g, `${origin}/api/business/photo`);
  };

  // The compiled HTML string that drives the iframe + copy/edit.
  const buildHtml = () => {
    if (pages?.html) return fixPhotoUrls(pages.html);
    const cleanJSX = (code) => (code || '').replace(/export\s+default\s+/g, '');
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Generated Website</title><script src="https://cdn.tailwindcss.com"></script><script src="https://unpkg.com/react@18/umd/react.production.min.js" crossorigin></script><script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js" crossorigin></script><script src="https://unpkg.com/@babel/standalone/babel.min.js"></script></head><body><div id="root"></div><script type="text/babel">const {useState,useEffect}=React;try{${cleanJSX(pages?.landing)}${cleanJSX(pages?.feature)}${cleanJSX(pages?.contact)}const root=ReactDOM.createRoot(document.getElementById('root'));root.render(typeof Landing!=='undefined'?<Landing/>:<div>No content</div>);}catch(e){document.getElementById('root').innerHTML='<pre style="color:red;padding:2rem">'+e.message+'</pre>';}</script></body></html>`;
  };

  const htmlStr = pages ? buildHtml() : '';
  const canEdit = !!pages?.html; // only the self-contained HTML format is editable

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(htmlStr);
      setCopied(true);
      toast.success('Code copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy. Try the Edit Code panel to select manually.');
    }
  };

  const openCodePanel = () => {
    setCodeDraft(htmlStr);
    setPanel('code');
  };

  const handleSaveCode = async () => {
    if (!codeDraft || codeDraft.trim().length < 50) {
      toast.error('Code looks empty or too short.');
      return;
    }
    setSavingCode(true);
    const toastId = toast.loading('Saving your changes...');
    try {
      const { data } = await api.put(`/website/${placeId}/code`, { html: codeDraft });
      setPages(data.pages);
      toast.success('Saved — changes are live.', { id: toastId });
      setPanel('none');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to save.'), { id: toastId });
    } finally {
      setSavingCode(false);
    }
  };

  // Downscale an uploaded screenshot to keep the payload small (max 1400px, JPEG).
  const handleImagePick = (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Please choose an image file.'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 1200;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        // Keep the data URL under the vision endpoint's ~180KB inline limit by
        // stepping the JPEG quality down until it fits.
        let quality = 0.72;
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        while (dataUrl.length > 175000 && quality > 0.35) {
          quality -= 0.12;
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }
        setBugImage(dataUrl);
      };
      img.onerror = () => toast.error('Could not read that image.');
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  const handleFixBug = async () => {
    if ((!bugText || bugText.trim().length < 4) && !bugImage) {
      toast.error('Describe the bug or attach a screenshot first.');
      return;
    }
    if (!window.confirm('AI bug fix will use 1 AI credit. Continue?')) return;
    setFixing(true);
    const toastId = toast.loading(bugImage ? 'AI is analyzing your screenshot…' : 'AI is fixing the reported issue…');
    try {
      const { data } = await api.post(`/website/${placeId}/fix`, { bugs: bugText, image: bugImage || undefined });
      setPages(data.pages);
      toast.success('Fix applied — check the preview.', { id: toastId });
      setBugText('');
      setBugImage(null);
      setPanel('none');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not fix.'), { id: toastId });
    } finally {
      setFixing(false);
    }
  };

  if (loading || changingTheme) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-accent" />
          <p className="mt-4 text-text-muted">{changingTheme ? 'Applying new theme...' : 'Loading your AI website...'}</p>
        </div>
      </div>
    );
  }

  if (!pages) return null;

  const iconBtn = 'flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors';

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Top Navigation Bar */}
      <div className="flex h-14 items-center justify-between border-b border-border bg-surface px-4">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(`/business/${placeId}`)} className="flex items-center gap-2 text-sm font-medium text-text-muted hover:text-text">
            <ArrowLeft className="h-4 w-4" />
            Back to Localify
          </button>
          <div className="h-4 w-px bg-border" />
          <span className="font-display text-sm font-bold text-accent"></span>
        </div>

        <div className="hidden md:flex items-center gap-2 rounded-lg bg-surface-2 p-1">
          <button onClick={() => setDevice('desktop')} className={`rounded p-1.5 transition-colors ${device === 'desktop' ? 'bg-surface shadow-sm text-text' : 'text-text-muted hover:text-text'}`}>
            <Monitor className="h-4 w-4" />
          </button>
          <button onClick={() => setDevice('mobile')} className={`rounded p-1.5 transition-colors ${device === 'mobile' ? 'bg-surface shadow-sm text-text' : 'text-text-muted hover:text-text'}`}>
            <Smartphone className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          {canEdit && (
            <>
              <button onClick={handleCopy} className={`${iconBtn} text-text-muted hover:text-text hover:bg-surface-2`} title="Copy full HTML">
                {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                <span className="hidden lg:inline">{copied ? 'Copied' : 'Copy'}</span>
              </button>
              <button onClick={openCodePanel} className={`${iconBtn} text-text-muted hover:text-text hover:bg-surface-2`} title="Edit code (free)">
                <Code2 className="h-4 w-4" />
                <span className="hidden lg:inline">Edit Code</span>
              </button>
              <button onClick={() => setPanel('bug')} className={`${iconBtn} text-text-muted hover:text-text hover:bg-surface-2`} title="Report a bug for AI to fix">
                <Bug className="h-4 w-4" />
                <span className="hidden lg:inline">Fix a Bug</span>
              </button>
            </>
          )}

          <div className="relative">
            <button onClick={() => setShowColorPicker(!showColorPicker)} className={`${iconBtn} text-text-muted hover:text-text hover:bg-surface-2`}>
              <Palette className="h-4 w-4" />
              <span className="hidden lg:inline">Theme</span>
            </button>
            {showColorPicker && (
              <div className="absolute right-0 top-full mt-2 w-64 rounded-xl bg-surface border border-border p-4 shadow-xl z-50">
                <h4 className="font-semibold text-text text-sm mb-2">Change Brand Color</h4>
                <p className="text-xs text-text-muted mb-4">This will re-generate the prototype and costs 1 credit.</p>
                <div className="flex items-center gap-3 mb-4">
                  <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} className="h-10 w-16 cursor-pointer rounded-lg bg-transparent" />
                  <input type="text" value={newColor} onChange={(e) => setNewColor(e.target.value)} className="input-base flex-1" />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setShowColorPicker(false)} className="btn-ghost flex-1">Cancel</button>
                  <button onClick={handleChangeTheme} className="btn-primary flex-1">Apply</button>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={() => {
              const blob = new Blob([htmlStr], { type: 'text/html' });
              const url = URL.createObjectURL(blob);
              window.open(url, '_blank');
            }}
            className={`${iconBtn} text-text-muted hover:text-text hover:bg-surface-2`}
          >
            <Maximize2 className="h-4 w-4" />
            <span className="hidden lg:inline">Open Full</span>
          </button>
        </div>
      </div>

      {/* Body: preview + optional side panel */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-hidden bg-background p-4">
          <div className={`mx-auto h-full transition-all duration-300 ${device === 'mobile' ? 'max-w-[400px]' : 'max-w-full'}`}>
            <div className={`h-full overflow-hidden rounded-xl border border-border shadow-2xl ${device === 'mobile' ? 'ring-8 ring-surface-2' : ''}`}>
              <iframe
                key={htmlStr.length}
                srcDoc={htmlStr}
                className="h-full w-full bg-white"
                title="AI Generated Website"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
              />
            </div>
          </div>
        </div>

        {/* Edit Code drawer */}
        {panel === 'code' && (
          <div className="flex w-full max-w-[46%] flex-col border-l border-border bg-surface">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-text">
                <Code2 className="h-4 w-4 text-accent" /> Edit Code <span className="text-xs font-normal text-text-muted">(free · saves instantly)</span>
              </div>
              <button onClick={() => setPanel('none')} className="text-text-muted hover:text-text"><X className="h-4 w-4" /></button>
            </div>
            <textarea
              value={codeDraft}
              onChange={(e) => setCodeDraft(e.target.value)}
              spellCheck={false}
              className="flex-1 resize-none bg-[#0d1117] p-4 font-mono text-xs leading-relaxed text-[#c9d1d9] outline-none"
            />
            <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
              <button onClick={() => setPanel('none')} className="btn-ghost">Cancel</button>
              <button onClick={handleSaveCode} disabled={savingCode} className="btn-primary gap-2">
                {savingCode ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Changes
              </button>
            </div>
          </div>
        )}

        {/* Fix a Bug drawer */}
        {panel === 'bug' && (
          <div className="flex w-full max-w-[40%] flex-col border-l border-border bg-surface">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-text">
                <Bug className="h-4 w-4 text-accent" /> Report a Bug
              </div>
              <button onClick={() => setPanel('none')} className="text-text-muted hover:text-text"><X className="h-4 w-4" /></button>
            </div>
            <div className="flex flex-1 flex-col gap-3 p-4">
              <p className="text-sm text-text-muted">
                Describe exactly what's wrong (which section, what looks broken). The AI fixes <span className="text-text font-medium">only</span> what you describe and leaves everything else untouched.
              </p>
              <textarea
                value={bugText}
                onChange={(e) => setBugText(e.target.value)}
                placeholder={'e.g. "The product cards are different heights and have big empty boxes" or "The Book Now button in the hero does nothing".'}
                className="min-h-[130px] flex-1 resize-none rounded-lg border border-border bg-surface-2 p-3 text-sm text-text outline-none focus:ring-2 focus:ring-accent"
              />

              {/* Screenshot upload */}
              {bugImage ? (
                <div className="relative overflow-hidden rounded-lg border border-border">
                  <img src={bugImage} alt="bug screenshot" className="max-h-44 w-full object-contain bg-black/20" />
                  <button
                    onClick={() => setBugImage(null)}
                    className="absolute right-2 top-2 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
                    title="Remove screenshot"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-surface-2 px-3 py-3 text-sm text-text-muted hover:text-text hover:border-accent">
                  <ImagePlus className="h-4 w-4" />
                  Attach a screenshot of the problem (optional)
                  <input type="file" accept="image/*" onChange={handleImagePick} className="hidden" />
                </label>
              )}

              <div className="rounded-lg bg-accent/10 px-3 py-2 text-xs text-accent">
                <Sparkles className="mr-1 inline h-3.5 w-3.5" />
                An AI bug fix uses <strong>1 credit</strong>. Manual edits in "Edit Code" are free.
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
              <button onClick={() => setPanel('none')} className="btn-ghost">Cancel</button>
              <button onClick={handleFixBug} disabled={fixing} className="btn-primary gap-2">
                {fixing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Fix with AI (1 credit)
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default GeneratedWebsitePage;
