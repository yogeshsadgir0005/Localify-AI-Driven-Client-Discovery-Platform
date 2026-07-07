import { Link } from 'react-router-dom';
import { Twitter, Linkedin, Github, Mail } from 'lucide-react';

const Footer = () => (
  <footer className="border-t border-border bg-bg/50 pt-16 pb-8 backdrop-blur-sm">
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <div className="grid grid-cols-1 gap-12 md:grid-cols-4 lg:gap-8">
        {/* Brand Column */}
        <div className="flex flex-col items-start space-y-6 md:col-span-1">
          <Link to="/" className="flex items-center">
            <img src="/logo4.png" alt="Localify" className="h-16 w-auto -my-4 object-contain" />
          </Link>
          <p className="text-sm leading-relaxed text-text-muted">
            Discover the hidden businesses your city never told you about. We surface contact details, analyze local presence, and generate smart AI outreach.
          </p>
          <div className="flex space-x-4">
            <a href="#" className="text-text-muted transition hover:text-primary">
              <Twitter className="h-5 w-5" />
            </a>
            <a href="#" className="text-text-muted transition hover:text-primary">
              <Linkedin className="h-5 w-5" />
            </a>
            <a href="#" className="text-text-muted transition hover:text-primary">
              <Github className="h-5 w-5" />
            </a>
          </div>
        </div>

        {/* Links Columns */}
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 md:col-span-3">
          <div className="space-y-4">
            <h4 className="font-display text-sm font-semibold tracking-wider text-text uppercase">Product</h4>
            <ul className="space-y-3 text-sm text-text-muted">
              <li><Link to="/search" className="transition hover:text-primary">Find Businesses</Link></li>
              <li><Link to="/features/outreach" className="transition hover:text-primary">AI Outreach</Link></li>
              <li><Link to="/features/analytics" className="transition hover:text-primary">Local Analytics</Link></li>
              <li><Link to="/pricing" className="transition hover:text-primary">Pricing</Link></li>
            </ul>
          </div>

          <div className="space-y-4">
            <h4 className="font-display text-sm font-semibold tracking-wider text-text uppercase">Company</h4>
            <ul className="space-y-3 text-sm text-text-muted">
              <li><Link to="/about" className="transition hover:text-primary">About Us</Link></li>
              <li><Link to="/careers" className="transition hover:text-primary">Careers</Link></li>
              <li><Link to="/blog" className="transition hover:text-primary">Blog</Link></li>
              <li><Link to="/contact" className="transition hover:text-primary">Contact</Link></li>
            </ul>
          </div>

          <div className="space-y-4">
            <h4 className="font-display text-sm font-semibold tracking-wider text-text uppercase">Legal</h4>
            <ul className="space-y-3 text-sm text-text-muted">
              <li><Link to="/privacy" className="transition hover:text-primary">Privacy Policy</Link></li>
              <li><Link to="/terms" className="transition hover:text-primary">Terms of Service</Link></li>
              <li><Link to="/cookies" className="transition hover:text-primary">Cookie Policy</Link></li>
            </ul>
          </div>
        </div>
      </div>

      <div className="mt-16 flex flex-col items-center justify-between border-t border-border pt-8 sm:flex-row">
        <p className="text-sm text-text-muted">
          © {new Date().getFullYear()} Localify. All rights reserved.
        </p>
        <div className="mt-4 flex space-x-6 sm:mt-0 text-sm text-text-muted">
          <span className="flex items-center gap-1.5 hover:text-text cursor-pointer transition">
            <Mail className="h-4 w-4" /> support@localify.app
          </span>
        </div>
      </div>
    </div>
  </footer>
);

export default Footer;
