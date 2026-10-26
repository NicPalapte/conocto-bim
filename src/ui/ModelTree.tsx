import { memo } from 'react';
import type { TreeNode } from '../model/tree';

// Mehr Zeilen je Ebene machen den Baum bei großen Modellen träge; Suche hilft weiter.
const MAX_CHILDREN = 300;

export interface TreeProps {
  nodes: TreeNode[];
  depth: number;
  expanded: ReadonlySet<string>;
  selectedKey: string | null;
  onToggle: (key: string) => void;
  onSelect: (node: TreeNode) => void;
  onFocus: (node: TreeNode) => void;
}

export const TreeLevel = memo(function TreeLevel(props: TreeProps) {
  const { nodes, depth, expanded, selectedKey, onToggle, onSelect, onFocus } = props;
  const shown = nodes.slice(0, MAX_CHILDREN);
  return (
    <>
      {shown.map((node) => {
        const open = expanded.has(node.key);
        const hasChildren = node.children.length > 0;
        return (
          <div key={node.key} role="treeitem" aria-expanded={hasChildren ? open : undefined}>
            <button
              type="button"
              className={`tree-row${selectedKey === node.key ? ' selected' : ''}`}
              style={{ paddingLeft: 12 + depth * 12 }}
              onClick={() => onSelect(node)}
              onDoubleClick={() => onFocus(node)}
              title={node.label}
            >
              <span
                className="twisty"
                onClick={(e) => {
                  if (!hasChildren) return;
                  e.stopPropagation();
                  onToggle(node.key);
                }}
              >
                {hasChildren ? (open ? '▾' : '▸') : ''}
              </span>
              <span className={`text${node.kind === 'spatial' ? ' spatial' : ''}`}>
                {node.label}
              </span>
              {node.kind !== 'element' && (
                <span className="count">{node.elementIds.length.toLocaleString('de-DE')}</span>
              )}
            </button>
            {open && hasChildren && (
              <TreeLevel {...props} nodes={node.children} depth={depth + 1} />
            )}
          </div>
        );
      })}
      {nodes.length > MAX_CHILDREN && (
        <div className="tree-more" style={{ paddingLeft: 24 + depth * 12 }}>
          … {(nodes.length - MAX_CHILDREN).toLocaleString('de-DE')} weitere – Suche nutzen
        </div>
      )}
    </>
  );
});
