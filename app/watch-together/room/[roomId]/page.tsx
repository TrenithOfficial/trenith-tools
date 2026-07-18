import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WatchRoom } from "../../../../components/watch-room";
import { isWatchRoomId } from "../../../../packages/watch-core";

export const metadata: Metadata = { title: "Private Watch Room", description: "Join a temporary encrypted Trenith Watch Together room.", robots: { index: false, follow: false, noarchive: true, nosnippet: true } };

export default async function WatchRoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  if (!isWatchRoomId(roomId)) notFound();
  return <WatchRoom roomId={roomId} />;
}
