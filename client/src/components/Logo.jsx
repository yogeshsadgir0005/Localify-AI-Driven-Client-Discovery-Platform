import { Link } from 'react-router-dom';

const Logo = ({ className = 'h-16 w-auto object-contain' }) => (
  <Link to="/" className="flex items-center justify-center">
    <img src="/logo4.png" alt="Localify" className={className} />
  </Link>
);

export default Logo;
