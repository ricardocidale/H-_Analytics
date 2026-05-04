import Layout from "@/components/Layout";
import { AnimatedPage } from "@/components/graphics/AnimatedPage";
import { PageHeader } from "@/components/ui/page-header";
import SlideDecksTab from "@/components/admin/SlideDecksTab";

export default function SlideDecks() {
  return (
    <Layout>
      <AnimatedPage>
        <div className="max-w-6xl mx-auto space-y-6 p-4 sm:p-6">
          <PageHeader
            title="Slide Decks"
            subtitle="Investor-ready 6-slide L+B decks for each property. Open any property to download individual slides or edit authored copy."
          />
          <SlideDecksTab />
        </div>
      </AnimatedPage>
    </Layout>
  );
}
