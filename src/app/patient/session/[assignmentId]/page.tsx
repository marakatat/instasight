import { ExerciseSession } from "@/components/patient/ExerciseSession";

export default async function SessionPage(props: { params: Promise<{ assignmentId: string }> }) {
  const params = await props.params;
  const exerciseId = params.assignmentId;
  
  return (
    <main className="min-h-screen bg-[#F7F4EE] font-sans">
      <ExerciseSession exerciseId={exerciseId} />
    </main>
  );
}
