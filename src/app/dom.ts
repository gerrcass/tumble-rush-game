export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function byId<T extends HTMLElement>(root: ParentNode, id: string): T {
  const node = root.querySelector<T>(`#${id}`);
  if (!node) throw new Error(`Missing required element #${id}`);
  return node;
}
