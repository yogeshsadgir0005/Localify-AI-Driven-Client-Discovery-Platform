import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';

/**
 * A custom searchable dropdown that:
 *  - Shows a closed trigger that looks like a regular select
 *  - When clicked, opens a dropdown BELOW with a search input
 *  - Filters options as the user types
 *  - Always opens downward
 *
 * Props:
 *   options     — Array of { value, label }
 *   value       — Currently selected value
 *   onChange    — Called with the new value when user picks an option
 *   placeholder — Placeholder text when nothing is selected
 *   disabled    — Whether the component is disabled
 *   id          — HTML id for accessibility
 */
const SearchableSelect = ({
  options = [],
  value,
  onChange,
  placeholder = 'Select…',
  disabled = false,
  id,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef(null);
  const searchRef = useRef(null);

  // Find the label for the current value
  const selectedLabel = options.find((o) => o.value === value)?.label || '';

  // Filter options based on search
  const filtered = search.trim()
    ? options.filter((o) =>
        o.label.toLowerCase().includes(search.toLowerCase())
      )
    : options;

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
        setSearch('');
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Focus search input when opened
  useEffect(() => {
    if (isOpen && searchRef.current) {
      searchRef.current.focus();
    }
  }, [isOpen]);

  const handleSelect = (val) => {
    onChange(val);
    setIsOpen(false);
    setSearch('');
  };

  const handleToggle = () => {
    if (disabled) return;
    setIsOpen((prev) => !prev);
    setSearch('');
  };

  // Keyboard navigation
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      setSearch('');
    }
  };

  return (
    <div ref={containerRef} className="relative" onKeyDown={handleKeyDown}>
      {/* Trigger button */}
      <button
        type="button"
        id={id}
        onClick={handleToggle}
        disabled={disabled}
        className={`input-base flex w-full items-center justify-between pr-10 text-left ${
          disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
        } ${!selectedLabel ? 'text-text-muted' : ''}`}
      >
        <span className="truncate">
          {selectedLabel || placeholder}
        </span>
        <ChevronDown
          className={`pointer-events-none absolute inset-y-0 right-3 my-auto h-5 w-5 text-text-muted transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Dropdown — always opens below */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-border bg-surface shadow-lg shadow-black/30">
          {/* Search input */}
          <div className="border-b border-border p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search…"
                className="w-full rounded-lg border border-border bg-bg px-3 py-2 pl-9 text-sm text-text outline-none placeholder:text-text-muted focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          {/* Options list */}
          <ul className="max-h-52 overflow-y-auto overscroll-contain py-1">
            {filtered.length === 0 ? (
              <li className="px-4 py-3 text-center text-sm text-text-muted">
                No results found
              </li>
            ) : (
              filtered.map((opt) => (
                <li key={opt.value}>
                  <button
                    type="button"
                    onClick={() => handleSelect(opt.value)}
                    className={`flex w-full items-center px-4 py-2.5 text-left text-sm transition-colors hover:bg-primary/10 hover:text-primary ${
                      opt.value === value
                        ? 'bg-primary/15 font-medium text-primary'
                        : 'text-text'
                    }`}
                  >
                    {opt.label}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
};

export default SearchableSelect;
