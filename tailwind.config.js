/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // 背景层
        base: "var(--bg-base)",
        surface: "var(--bg-surface)",
        elevated: "var(--bg-elevated)",
        // 边框
        "border-subtle": "var(--border-subtle)",
        "border-strong": "var(--border-strong)",
        // 文字
        primary: "var(--text-primary)",
        secondary: "var(--text-secondary)",
        tertiary: "var(--text-tertiary)",
        disabled: "var(--text-disabled)",
        // 强调色
        accent: "var(--accent)",
        "accent-hover": "var(--accent-hover)",
        "accent-active": "var(--accent-active)",
        "accent-soft": "var(--accent-soft)",
        // 语义色
        success: "var(--success)",
        warning: "var(--warning)",
        danger: "var(--danger)",
        info: "var(--info)",
        "success-soft": "var(--success-soft)",
        "warning-soft": "var(--warning-soft)",
        "danger-soft": "var(--danger-soft)",
        "info-soft": "var(--info-soft)",
      },
      fontSize: {
        label: ["10px", "1.3"],
        helper: ["11px", "1.4"],
        body: ["13px", "1.5"],
        title: ["14px", "1.4"],
      },
      fontFamily: {
        mono: ["'JetBrains Mono'", "'SF Mono'", "'Fira Code'", "monospace"],
      },
    },
  },
  plugins: [],
};
