import { EpisodeRating } from "@/components/detail/episode-rating";

export function Rated() {
  return <EpisodeRating rating={7} disabled />;
}

export function Unrated() {
  return <EpisodeRating rating={null} disabled />;
}

export function Interactive() {
  return <EpisodeRating rating={6} onRate={() => {}} />;
}

export function Large() {
  return <EpisodeRating rating={9} disabled size={18} />;
}
