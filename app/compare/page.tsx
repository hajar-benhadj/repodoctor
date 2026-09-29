import CompareClient from "../components/CompareClient";

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const { a, b } = await searchParams;
  return <CompareClient aId={a ?? ""} bId={b ?? ""} />;
}
