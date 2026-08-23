import { ExerciseSession } from "@/components/patient/ExerciseSession";

export default async function SessionPage(props: { params: Promise<{ assignmentId: string }> }) {
  const params = await props.params;
  const exerciseId = params.assignmentId;
  
  return (
    <main className="min-h-screen bg-black text-white">
      <ExerciseSession exerciseId={exerciseId} />
    </main>
  );
}
