import AnalysisClient from "../../components/AnalysisClient";

export default async function AnalysisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AnalysisClient id={id} />;
}
