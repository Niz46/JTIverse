"use client";

/**
 * UI PRIMITIVES
 * -------------
 * Base-level building blocks. No API calls, no Clerk, no business
 * logic — just styled HTML elements following the design tokens
 * defined in globals.css. Every other component builds on these.
 */

import {
  forwardRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

// ============================================================
// BUTTON
// ============================================================

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      loading,
      children,
      className = "",
      disabled,
      ...props
    },
    ref,
  ) => {
    const base =
      "inline-flex items-center justify-center font-medium rounded-lg transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] cursor-pointer";

    const variants = {
      primary:
        "bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] active:scale-[0.98]",
      secondary:
        "bg-[var(--color-surface-2)] text-[var(--color-text)] border border-[var(--color-border)] hover:border-[var(--color-border-2)] hover:bg-[var(--color-surface-3)] active:scale-[0.98]",
      ghost:
        "text-[var(--color-text-2)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-2)] active:scale-[0.98]",
      danger:
        "bg-[var(--color-error)]/10 text-[var(--color-error)] border border-[var(--color-error)]/30 hover:bg-[var(--color-error)]/20 active:scale-[0.98]",
    };

    const sizes = {
      sm: "text-xs px-3 py-1.5 gap-1.5",
      md: "text-sm px-4 py-2 gap-2",
      lg: "text-base px-6 py-2.5 gap-2",
    };

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
        {...props}
      >
        {loading ? (
          <>
            <Spinner size="sm" />
            {children}
          </>
        ) : (
          children
        )}
      </button>
    );
  },
);
Button.displayName = "Button";

// ============================================================
// BADGE
// ============================================================

interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "accent" | "gold" | "success" | "error" | "muted";
  className?: string;
}

export function Badge({
  children,
  variant = "default",
  className = "",
}: BadgeProps) {
  const variants = {
    default:
      "bg-[var(--color-surface-2)] text-[var(--color-text-2)] border border-[var(--color-border)]",
    accent:
      "bg-[var(--color-accent-muted)] text-[var(--color-accent-hover)] border border-[var(--color-accent)]/30",
    gold: "bg-[var(--color-gold-muted)] text-[var(--color-gold)] border border-[var(--color-gold)]/30",
    success:
      "bg-[var(--color-success)]/10 text-[var(--color-success)] border border-[var(--color-success)]/30",
    error:
      "bg-[var(--color-error)]/10 text-[var(--color-error)] border border-[var(--color-error)]/30",
    muted:
      "bg-transparent text-[var(--color-muted)] border border-[var(--color-border)]",
  };

  return (
    <span
      className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full ${variants[variant]} ${className}`}
    >
      {children}
    </span>
  );
}

// ============================================================
// CARD
// ============================================================

interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  hoverable?: boolean;
}

export function Card({
  children,
  className = "",
  onClick,
  hoverable,
}: CardProps) {
  return (
    <div
      onClick={onClick}
      className={`bg-(--color-surface) border border-(--color-border) rounded-xl overflow-hidden ${hoverable ? "cursor-pointer hover:border-(--color-border-2) hover:bg-(--color-surface-2) transition-colors duration-150" : ""} ${className}`}
    >
      {children}
    </div>
  );
}

// ============================================================
// INPUT
// ============================================================

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = "", id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");
    return (
      <div className="flex flex-col gap-1.5 w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-(--color-text-2)"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`w-full px-3 py-2 bg-(--color-surface-2) border ${
            error ? "border-(--color-error)" : "border-(--color-border)"
          } rounded-lg text-sm text-(--color-text) placeholder:text-(--color-muted) focus:outline-none focus:border-(--color-accent) transition-colors ${className}`}
          {...props}
        />
        {error && <p className="text-xs text-(--color-error)">{error}</p>}
      </div>
    );
  },
);
Input.displayName = "Input";

// ============================================================
// TEXTAREA
// ============================================================

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className = "", id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");
    return (
      <div className="flex flex-col gap-1.5 w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-(--color-text-2)"
          >
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={inputId}
          className={`w-full px-3 py-2 bg-(--color-surface-2) border ${
            error ? "border-(--color-error)" : "border-(--color-border)"
          } rounded-lg text-sm text-(--color-text) placeholder:text-(--color-muted) focus:outline-none focus:border-(--color-accent) transition-colors resize-none ${className}`}
          {...props}
        />
        {error && <p className="text-xs text-(--color-error)">{error}</p>}
      </div>
    );
  },
);
Textarea.displayName = "Textarea";

// ============================================================
// SPINNER
// ============================================================

export function Spinner({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "w-3.5 h-3.5", md: "w-5 h-5", lg: "w-7 h-7" };
  return (
    <svg
      className={`${sizes[size]} animate-spin text-(--color-accent)`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

// ============================================================
// SKELETON (loading placeholder)
// ============================================================

export function Skeleton({
  className = "",
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`bg-(--color-surface-2) rounded animate-pulse ${className}`}
      style={style}
      aria-hidden="true"
    />
  );
}

// ============================================================
// DIVIDER
// ============================================================

export function Divider({ className = "" }: { className?: string }) {
  return <hr className={`border-(--color-border) ${className}`} />;
}

// ============================================================
// EMPTY STATE
// ============================================================

interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({
  icon = "📭",
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <span className="text-4xl" aria-hidden="true">
        {icon}
      </span>
      <p className="text-(--color-text) font-medium">{title}</p>
      {description && (
        <p className="text-sm text-(--color-muted) max-w-xs">{description}</p>
      )}
      {action}
    </div>
  );
}
