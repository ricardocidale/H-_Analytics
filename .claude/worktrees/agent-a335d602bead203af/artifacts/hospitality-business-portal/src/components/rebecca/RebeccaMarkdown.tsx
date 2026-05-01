import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Components } from "react-markdown";
import { parseRichBlocks } from "./rich-block-parser";
import { RichBlock } from "./RichBlockRenderers";

interface AssetMatch {
  type: "photo" | "logo";
  id: number;
  url: string;
  caption: string;
  propertyName?: string;
  propertyId?: number;
  isHero?: boolean;
  score: number;
}

interface RebeccaMarkdownProps {
  content: string;
  assets?: AssetMatch[];
  locale?: string;
}

const markdownComponents: Components = {
  p: ({ children }) => (
    <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  em: ({ children }) => (
    <em className="italic text-foreground/80">{children}</em>
  ),
  h1: ({ children }) => (
    <h4 className="text-sm font-bold text-foreground mt-3 mb-1.5 first:mt-0">{children}</h4>
  ),
  h2: ({ children }) => (
    <h4 className="text-sm font-bold text-foreground mt-3 mb-1.5 first:mt-0">{children}</h4>
  ),
  h3: ({ children }) => (
    <h5 className="text-[13px] font-semibold text-foreground mt-2.5 mb-1 first:mt-0">{children}</h5>
  ),
  h4: ({ children }) => (
    <h6 className="text-[13px] font-semibold text-foreground/90 mt-2 mb-1 first:mt-0">{children}</h6>
  ),
  ul: ({ children }) => (
    <ul className="list-disc pl-4 mb-2 space-y-0.5 text-[13px]">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal pl-4 mb-2 space-y-0.5 text-[13px]">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="leading-relaxed">{children}</li>
  ),
  code: ({ children, className }) => {
    const isBlock = className?.includes("language-");
    if (isBlock) {
      return (
        <code className={cn(
          "block bg-background/60 border border-border/30 rounded-md px-3 py-2 text-xs font-mono overflow-x-auto my-2",
          className,
        )}>
          {children}
        </code>
      );
    }
    return (
      <code className="bg-background/60 border border-border/30 rounded px-1 py-0.5 text-xs font-mono">
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="my-2 overflow-x-auto">{children}</pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-primary/40 pl-3 my-2 text-foreground/80 italic text-[13px]">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="my-2 rounded-md border border-border/40 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">{children}</table>
      </div>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-muted/60 border-b border-border/40">{children}</thead>
  ),
  tbody: ({ children }) => (
    <tbody className="divide-y divide-border/20">{children}</tbody>
  ),
  tr: ({ children }) => (
    <tr className="hover:bg-muted/30 transition-colors">{children}</tr>
  ),
  th: ({ children }) => (
    <th className="px-2.5 py-1.5 text-left font-semibold text-foreground/80 whitespace-nowrap">{children}</th>
  ),
  td: ({ children }) => (
    <td className="px-2.5 py-1.5 text-foreground/90 whitespace-nowrap">{children}</td>
  ),
  hr: () => (
    <hr className="my-3 border-border/30" />
  ),
  a: ({ href, children }) => {
    const isSafe = href && /^https?:\/\//i.test(href);
    if (!isSafe) return <span className="text-primary">{children}</span>;
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 hover:text-primary/80">
        {children}
      </a>
    );
  },
  img: ({ src, alt }) => (
    <div className="mt-2 mb-2 rounded-lg overflow-hidden border border-border/50 bg-background/50">
      <img
        src={src}
        alt={alt || ""}
        className="w-full max-h-48 object-cover"
        loading="lazy"
        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        data-testid={`img-rebecca-md-inline`}
      />
      {alt && (
        <div className="px-2 py-1 text-[10px] text-muted-foreground flex items-center gap-1">
          <ImageIcon className="w-3 h-3" />
          {alt}
        </div>
      )}
    </div>
  ),
};

export function RebeccaMarkdown({ content, assets, locale }: RebeccaMarkdownProps) {
  const nodes = useMemo(() => parseRichBlocks(content), [content]);

  const extraAssets = useMemo(() => {
    if (!assets?.length) return [];
    const imgRegex = /!\[[^\]]*\]\(([^)]+)\)/g;
    const inlineSrcs = new Set<string>();
    let match;
    while ((match = imgRegex.exec(content)) !== null) {
      inlineSrcs.add(match[1]);
    }
    return assets.filter((a) => !inlineSrcs.has(a.url));
  }, [content, assets]);

  return (
    <div className="rebecca-markdown space-y-0">
      {nodes.map((node, i) => {
        if (node.type === "richblock") {
          return <RichBlock key={`rb-${i}`} block={node.block} locale={locale} />;
        }
        return (
          <ReactMarkdown key={`md-${i}`} remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {node.content}
          </ReactMarkdown>
        );
      })}

      {extraAssets.length > 0 && (
        <div className="grid grid-cols-2 gap-1.5 mt-2">
          {extraAssets.map((asset) => (
            <div
              key={`${asset.type}-${asset.id}`}
              className="rounded-lg overflow-hidden border border-border/50 bg-background/50"
            >
              <img
                src={asset.url}
                alt={asset.caption}
                className="w-full h-24 object-cover"
                loading="lazy"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                data-testid={`img-rebecca-asset-${asset.type}-${asset.id}`}
              />
              <div className="px-2 py-1 text-[10px] text-muted-foreground truncate flex items-center gap-1">
                <ImageIcon className="w-3 h-3 shrink-0" />
                {asset.caption}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
