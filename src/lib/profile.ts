import { getMyProfile as getGraphProfile } from "@/lib/instagram-graph";

export interface Profile {
  username: string;
  fullName: string;
  biography: string;
  profilePicUrl: string;
  followerCount: number;
  followingCount: number;
  mediaCount: number;
}

export async function getMyProfile(accessToken: string): Promise<Profile> {
  const account = await getGraphProfile(accessToken);

  return {
    username: account.username,
    fullName: account.name ?? account.username,
    biography: account.biography ?? "",
    profilePicUrl: account.profile_picture_url ?? "",
    followerCount: account.followers_count ?? 0,
    followingCount: account.follows_count ?? 0,
    mediaCount: account.media_count ?? 0,
  };
}
