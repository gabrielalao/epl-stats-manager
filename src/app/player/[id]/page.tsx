import { PlayerDetailClient, type PlayerDetailClientProps } from "./player-detail-client";

type Props = {
  params: { id: string };
  searchParams: { season?: string };
};

export default function PlayerDetailPage({ params, searchParams }: Props) {
  const parsed = Number.parseInt(params.id, 10);
  const playerId = Number.isFinite(parsed) ? parsed : -1;
  const season = searchParams?.season || "current";
  const props: PlayerDetailClientProps = { playerId, season };
  return <PlayerDetailClient {...props} />;
}

