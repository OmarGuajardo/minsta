import { getAccount, getUserByUsername } from "@/lib/instagrapi";

export interface Profile {
  username: string;
  fullName: string;
  biography: string;
  profilePicUrl: string;
  followerCount: number;
  followingCount: number;
  mediaCount: number;
}

/**
 * `/account` only has identity fields; follower/following/media counts live
 * on `/user`, which requires already knowing the username.
 */
export async function getMyProfile(sessionId: string): Promise<Profile> {
  const account = await getAccount(sessionId);
  const user = await getUserByUsername(sessionId, account.username);

  return {
    username: account.username,
    fullName: account.full_name,
    biography: account.biography ?? "",
    profilePicUrl: user.profile_pic_url_hd ?? user.profile_pic_url ?? account.profile_pic_url,
    followerCount: user.follower_count,
    followingCount: user.following_count,
    mediaCount: user.media_count,
  };
}
