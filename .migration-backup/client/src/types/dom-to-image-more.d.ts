declare module "dom-to-image-more" {
  interface Options {
    width?: number;
    height?: number;
    style?: Record<string, string>;
    quality?: number;
    bgcolor?: string;
    filter?: (node: Node) => boolean;
    cacheBust?: boolean;
    imagePlaceholder?: string;
  }

  const domtoimage: {
    toSvg(node: Node, options?: Options): Promise<string>;
    toPng(node: Node, options?: Options): Promise<string>;
    toJpeg(node: Node, options?: Options): Promise<string>;
    toBlob(node: Node, options?: Options): Promise<Blob>;
    toPixelData(node: Node, options?: Options): Promise<Uint8ClampedArray>;
  };

  export default domtoimage;
}
