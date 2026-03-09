import { Card, CardContent, CardHeader } from '@/components/ui/card';

export default function ProductDetailLoading() {
  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Back button skeleton */}
      <div className="h-9 w-24 animate-pulse rounded-md bg-muted" />

      {/* Header skeleton */}
      <div className="flex flex-col gap-2">
        <div className="h-8 w-64 animate-pulse rounded-md bg-muted" />
        <div className="flex gap-2">
          <div className="h-5 w-20 animate-pulse rounded-full bg-muted" />
          <div className="h-5 w-32 animate-pulse rounded-md bg-muted" />
        </div>
      </div>

      {/* Velocity table skeleton */}
      <Card>
        <CardHeader>
          <div className="h-6 w-40 animate-pulse rounded-md bg-muted" />
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-10 w-full animate-pulse rounded-md bg-muted" />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Events table skeleton */}
      <Card>
        <CardHeader>
          <div className="h-5 w-32 animate-pulse rounded-md bg-muted" />
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-8 w-full animate-pulse rounded-md bg-muted" />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
