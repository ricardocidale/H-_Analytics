import { SectionCard } from "@/components/ui/section-card";
import { IconImage } from "@/components/icons";interface SectionProps {
  expanded: boolean;
  onToggle: () => void;
  sectionRef: (el: HTMLDivElement | null) => void;
}

export default function Section06PropertyImages({ expanded, onToggle, sectionRef }: SectionProps) {
  return (
    <SectionCard
      id="property-images"
      title="6. Property Images"
      icon={IconImage}
      variant="light"
      expanded={expanded}
      onToggle={onToggle}
      sectionRef={sectionRef}
    >
      <p className="text-sm text-muted-foreground">
        Each property has a <strong>Photo Album</strong> that holds multiple images. One photo is designated as the
        <strong> hero image</strong> — it represents the property on portfolio cards, detail headers, and exported reports.
      </p>

      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-semibold mb-2">Photo Album</h4>
        <ul className="text-sm text-muted-foreground space-y-2 list-disc pl-5">
          <li>Open the property edit page and scroll to the <strong>Photo Album</strong> section below the main image picker.</li>
          <li>The album displays all photos in a responsive grid with the hero photo marked by a <strong>gold star</strong>.</li>
          <li>Click the gold star on any photo to set it as the hero. The hero image automatically syncs to the property card and header.</li>
          <li>Add an optional caption to any photo by clicking the text area below it.</li>
          <li>Delete a photo by clicking the trash icon. If you delete the hero, the next photo is automatically promoted.</li>
        </ul>
      </div>

      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-semibold mb-2">Uploading Images</h4>
        <ul className="text-sm text-muted-foreground space-y-2 list-disc pl-5">
          <li>Click <strong>"Upload"</strong> in the album header to open the upload dialog.</li>
          <li>Drag and drop files or click to browse. Supports JPEG, PNG, and WebP formats.</li>
          <li>Upload multiple files at once — each gets its own progress indicator.</li>
          <li>Add a caption to each photo before or after uploading.</li>
          <li>The first photo uploaded to an empty album is automatically set as the hero.</li>
        </ul>
      </div>

      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-semibold mb-2">AI Image Generation</h4>
        <ul className="text-sm text-muted-foreground space-y-2 list-disc pl-5">
          <li>Click <strong>"Generate"</strong> in the album header to create a photorealistic rendering using AI.</li>
          <li>The system auto-builds a prompt from the property name, location, room count, and type.</li>
          <li>Edit the prompt to customize the result, then click <strong>"Generate Image"</strong>.</li>
          <li>Preview the generated image. Click <strong>"Add to Album"</strong> to save it to the property.</li>
          <li>Optionally check <strong>"Set as hero"</strong> to make it the main property image immediately.</li>
          <li>Generate as many images as you like without closing the dialog.</li>
        </ul>
      </div>

      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-semibold mb-2">Hero Image Display</h4>
        <p className="text-sm text-muted-foreground">
          The hero image appears with a premium presentation — smooth blur-up loading, gradient overlays, and subtle
          entrance animations. It is automatically sized and cropped to fit each display context (portfolio cards use
          16:10 aspect ratio, property headers use full-width with gradient text overlay).
        </p>
      </div>

      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-semibold mb-2">Scenarios</h4>
        <p className="text-sm text-muted-foreground">
          When you save a scenario, all property photos (including hero assignments) are captured in the snapshot.
          Loading a scenario restores the full photo album for each property exactly as it was when saved.
        </p>
      </div>
    </SectionCard>
  );
}
