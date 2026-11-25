import { Link } from "react-router-dom";
import { Compass, MapPinOff } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/** Real 404 for unknown routes (the lobby used to be rendered silently). */
export function NotFoundPage() {
  return (
    <section aria-labelledby="page-title" className="mx-auto max-w-2xl py-6">
      <PageHeader
        eyebrow="Not found"
        title="This page is not part of the simulation."
        description="The address may be mistyped, or the page may have moved. Nothing was changed in your mission."
      />
      <Card className="mt-6">
        <CardContent className="flex flex-col gap-4">
          <span
            aria-hidden="true"
            className="grid size-12 place-items-center rounded-xl bg-accent text-accent-foreground"
          >
            <MapPinOff size={24} strokeWidth={2} />
          </span>
          <p className="text-sm text-muted-foreground">
            Use the navigation to return to your assigned missions, or open the
            lobby to pick up where you left off.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link to="/">
                <Compass aria-hidden="true" size={18} strokeWidth={2} />
                Mission lobby
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/briefing">Read a briefing</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
