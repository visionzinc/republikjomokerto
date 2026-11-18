import React from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme, type ThemeMode } from '../context/ThemeContext';

interface ThemeSwitcherProps {
  showLabels?: boolean;
  className?: string;
}

const THEME_OPTIONS: Array<{
  id: ThemeMode;
  label: string;
  title: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'system', label: 'System', title: 'Ikuti tema perangkat (System)', Icon: Monitor },
  { id: 'light', label: 'Light', title: 'Mode Terang (Light)', Icon: Sun },
  { id: 'dark', label: 'Dark', title: 'Mode Gelap (Dark)', Icon: Moon },
];

export function ThemeSwitcher({ showLabels = false, className = '' }: ThemeSwitcherProps) {
  const { themeMode, setThemeMode } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Pilih tema tampilan"
      className={`inline-flex items-center rounded-lg border border-[#E4E2DC] bg-white p-0.5 dark:border-[#26332E] dark:bg-[#151D1A] ${className}`}
    >
      {THEME_OPTIONS.map(({ id, label, title, Icon }) => {
        const active = themeMode === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={title}
            title={title}
            onClick={() => setThemeMode(id)}
            className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 ${
              active
                ? 'bg-[#0F5E46] text-white shadow-xs'
                : 'text-[#5B6561] hover:text-[#1C2421] dark:text-[#9AA8A2] dark:hover:text-[#ECEBE6]'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {showLabels && <span>{label}</span>}
          </button>
        );
      })}
    </div>
  );
}
