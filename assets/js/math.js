(() => {
  // Renderiza fórmulas $$ ... $$ e \( ... \) com o KaTeX (carregado antes, com defer).
  const el = document.querySelector('.prose');
  if (!el || typeof window.renderMathInElement !== 'function') return;
  window.renderMathInElement(el, {
    delimiters: [
      { left: '$$', right: '$$', display: true },
      { left: '\\(', right: '\\)', display: false },
    ],
    throwOnError: false,
  });
})();
