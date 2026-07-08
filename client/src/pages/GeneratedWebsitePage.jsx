import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Maximize2, Monitor, Smartphone, Palette } from 'lucide-react';
import api from '../utils/axios';
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

  useEffect(() => {
    const fetchWebsite = async () => {
      try {
        const { data } = await api.get(`/website/${placeId}`);
        if (data.success) {
          setPages(data.pages);
        }
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
    if (!window.confirm('Changing the theme will cost 1 AI Generation Credit. Are you sure?')) {
      return;
    }
    
    setChangingTheme(true);
    setShowColorPicker(false);
    const toastId = toast.loading('Applying new theme... (takes ~15 seconds)');
    
    try {
      const { data } = await api.post(`/website/${placeId}/change-theme`, { color: newColor });
      setPages(data.website.pages);
      toast.success('Theme updated!', { id: toastId });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to change theme.', { id: toastId });
    } finally {
      setChangingTheme(false);
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

  // We compile the React code dynamically in the browser using Babel Standalone inside the iframe
  const generateIframeHtml = () => {
    // New format: single self-contained HTML from premium template
    if (pages.html) {
      return pages.html;
    }

    // Legacy format: React components compiled via Babel
    // Strip "export default" to make the components available in the script's global scope
    const cleanJSX = (code) => code.replace(/export\s+default\s+/g, '');
    
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Generated Website</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <script src="https://unpkg.com/react@18/umd/react.production.min.js" crossorigin></script>
        <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js" crossorigin></script>
        <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
        <script src="https://unpkg.com/lucide@latest"></script>
        <style>
          body { margin: 0; padding: 0; -webkit-font-smoothing: antialiased; }
        </style>
      </head>
      <body>
        <div id="root"></div>
        <script type="text/babel" data-type="module">
          const { useState, useEffect } = React;

          try {
            ${cleanJSX(pages.landing)}
            ${cleanJSX(pages.feature)}
            ${cleanJSX(pages.contact)}

            function App() {
              const [currentRoute, setCurrentRoute] = useState('landing');
              
              useEffect(() => {
                if (window.lucide) {
                  window.lucide.createIcons();
                }
              }, [currentRoute]);

              const renderPage = () => {
                if (currentRoute === 'landing') return typeof Landing !== 'undefined' ? <Landing /> : <div className="p-8 text-center text-red-500">Landing component not found</div>;
                if (currentRoute === 'feature') return typeof Feature !== 'undefined' ? <Feature /> : <div className="p-8 text-center text-red-500">Feature component not found</div>;
                if (currentRoute === 'contact') return typeof Contact !== 'undefined' ? <Contact /> : <div className="p-8 text-center text-red-500">Contact component not found</div>;
                return <Landing />;
              };

              return (
                <div className="min-h-screen bg-gray-50 flex flex-col">
                  <nav className="bg-white border-b sticky top-0 z-50 flex items-center justify-center gap-4 p-4 shadow-sm">
                    <button onClick={() => setCurrentRoute('landing')} className={\`px-4 py-2 rounded-md font-medium transition-colors \${currentRoute === 'landing' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'}\`}>Home</button>
                    <button onClick={() => setCurrentRoute('feature')} className={\`px-4 py-2 rounded-md font-medium transition-colors \${currentRoute === 'feature' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'}\`}>Feature</button>
                    <button onClick={() => setCurrentRoute('contact')} className={\`px-4 py-2 rounded-md font-medium transition-colors \${currentRoute === 'contact' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'}\`}>Contact</button>
                  </nav>
                  <main className="flex-1">
                    {renderPage()}
                  </main>
                </div>
              );
            }

            const root = ReactDOM.createRoot(document.getElementById('root'));
            root.render(<App />);
          } catch (err) {
            document.getElementById('root').innerHTML = '<div style="padding: 2rem; color: red; font-family: monospace;"><h3>React Compilation Error</h3><pre>' + err.message + '</pre></div>';
          }
        </script>
      </body>
      </html>
    `;
  };

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Top Navigation Bar */}
      <div className="flex h-14 items-center justify-between border-b border-border bg-surface px-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(`/business/${placeId}`)}
            className="flex items-center gap-2 text-sm font-medium text-text-muted hover:text-text"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Localify
          </button>
          <div className="h-4 w-px bg-border" />
          <span className="font-display text-sm font-bold text-accent">
            AI Prototype
          </span>
        </div>

        <div className="flex items-center gap-2 rounded-lg bg-surface-2 p-1">
          <button
            onClick={() => setDevice('desktop')}
            className={`rounded p-1.5 transition-colors ${
              device === 'desktop' ? 'bg-surface shadow-sm text-text' : 'text-text-muted hover:text-text'
            }`}
          >
            <Monitor className="h-4 w-4" />
          </button>
          <button
            onClick={() => setDevice('mobile')}
            className={`rounded p-1.5 transition-colors ${
              device === 'mobile' ? 'bg-surface shadow-sm text-text' : 'text-text-muted hover:text-text'
            }`}
          >
            <Smartphone className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-2">
           <div className="relative">
             <button 
               onClick={() => setShowColorPicker(!showColorPicker)}
               className="btn-ghost text-sm"
             >
               <Palette className="h-4 w-4 mr-2" />
               Change Theme
             </button>

             {showColorPicker && (
               <div className="absolute right-0 top-full mt-2 w-64 rounded-xl bg-surface border border-border p-4 shadow-xl z-50">
                 <h4 className="font-semibold text-text text-sm mb-2">Change Brand Color</h4>
                 <p className="text-xs text-text-muted mb-4">This will re-generate the prototype and costs 1 credit.</p>
                 <div className="flex items-center gap-3 mb-4">
                    <input
                      type="color"
                      value={newColor}
                      onChange={(e) => setNewColor(e.target.value)}
                      className="h-10 w-16 cursor-pointer rounded-lg bg-transparent"
                    />
                    <input
                      type="text"
                      value={newColor}
                      onChange={(e) => setNewColor(e.target.value)}
                      className="input-base flex-1"
                    />
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
               const blob = new Blob([generateIframeHtml()], { type: 'text/html' });
               const url = URL.createObjectURL(blob);
               window.open(url, '_blank');
             }}
             className="btn-ghost text-sm"
           >
             <Maximize2 className="h-4 w-4 mr-2" />
             Open Full
           </button>
        </div>
      </div>

      {/* Iframe Container */}
      <div className="flex-1 overflow-hidden bg-background p-4">
        <div className={`mx-auto h-full transition-all duration-300 ${device === 'mobile' ? 'max-w-[400px]' : 'max-w-full'}`}>
          <div className={`h-full overflow-hidden rounded-xl border border-border shadow-2xl ${device === 'mobile' ? 'ring-8 ring-surface-2' : ''}`}>
            <iframe
              srcDoc={generateIframeHtml()}
              className="h-full w-full bg-white"
              title="AI Generated Website"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default GeneratedWebsitePage;
