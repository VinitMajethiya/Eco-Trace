import { useEffect, useRef } from 'react';

/**
 * Custom hook to trap focus within a container when open.
 * Cycles focus between focusable elements on Tab / Shift+Tab.
 * Closes the container when the Escape key is pressed.
 * Restores focus to the element that was focused before opening.
 */
export default function useFocusTrap(isOpen, onClose) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    const container = containerRef.current;
    if (!container) return;

    const previousActiveElement = document.activeElement;

    const focusableSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

    const getFocusableElements = () => {
      if (!container) return [];
      return Array.from(container.querySelectorAll(focusableSelector))
        .filter(el => !el.disabled && el.tabIndex !== -1 && el.offsetParent !== null);
    };

    // Initial focus on mount
    const focusable = getFocusableElements();
    if (focusable.length > 0) {
      focusable[0].focus();
    }

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      if (e.key === 'Tab') {
        const focusableElements = getFocusableElements();
        if (focusableElements.length === 0) {
          e.preventDefault();
          return;
        }

        const firstEl = focusableElements[0];
        const lastEl = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstEl) {
            lastEl.focus();
            e.preventDefault();
          }
        } else {
          if (document.activeElement === lastEl) {
            firstEl.focus();
            e.preventDefault();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (previousActiveElement && typeof previousActiveElement.focus === 'function') {
        previousActiveElement.focus();
      }
    };
  }, [isOpen, onClose]);

  return containerRef;
}
