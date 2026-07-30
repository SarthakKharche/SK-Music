import axios from 'axios';
import CryptoJS from 'crypto-js';
import { getFirestore } from '../config/firebase';
import type { User } from '../types/user.types';

export interface YtShelfItem {
  type: 'track' | 'playlist' | 'album';
  id: string; // videoId, playlistId, or browseId
  title: string;
  subtitle: string;
  thumbnail: string;
  durationSec?: number;
}

export interface YtShelf {
  title: string;
  items: YtShelfItem[];
}

export class YoutubeMusicService {
  private innerTubeUrl = 'https://music.youtube.com/youtubei/v1';
  private apiKey = 'AIzaSyAO1spn4Vx86us6r2cK7vP7W50PgF059CE'; // Standard YouTube Music Web Client API Key

  private decryptToken(encrypted: string): string {
    const secret = process.env.JWT_SECRET!;
    const bytes = CryptoJS.AES.decrypt(encrypted, secret);
    return bytes.toString(CryptoJS.enc.Utf8);
  }

  private encryptToken(token: string): string {
    const secret = process.env.JWT_SECRET!;
    return CryptoJS.AES.encrypt(token, secret).toString();
  }

  async refreshGoogleAccessToken(userId: string, refreshTokenDecrypted: string): Promise<string> {
    const db = getFirestore();
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshTokenDecrypted,
      grant_type: 'refresh_token',
    });

    const response = await axios.post('https://oauth2.googleapis.com/token', params);
    const newAccessToken = response.data.access_token;
    const expiresIn = response.data.expires_in || 3600;
    const newExpiry = new Date(Date.now() + expiresIn * 1000).toISOString();

    const encryptedAccessToken = this.encryptToken(newAccessToken);

    await db.collection('users').doc(userId).update({
      googleAccessToken: encryptedAccessToken,
      googleTokenExpiry: newExpiry,
      updatedAt: new Date().toISOString(),
    });

    return newAccessToken;
  }

  async getGoogleAccessToken(userId: string): Promise<string> {
    const db = getFirestore();
    const userDoc = await db.collection('users').doc(userId).get();
    const user = userDoc.data() as User;

    if (!user.googleAccessToken) {
      throw new Error('Google account not connected or access token missing.');
    }

    const expiry = new Date(user.googleTokenExpiry || 0);
    const now = new Date();

    if (now >= expiry && user.googleRefreshToken) {
      console.log('[YouTubeMusic] Google access token expired. Refreshing...');
      const decryptedRefresh = this.decryptToken(user.googleRefreshToken);
      return this.refreshGoogleAccessToken(userId, decryptedRefresh);
    }

    return this.decryptToken(user.googleAccessToken);
  }

  async fetchHomeFeed(_userId: string): Promise<YtShelf[]> {
    try {
      const response = await axios.post(
        `${this.innerTubeUrl}/browse?key=${this.apiKey}`,
        {
          browseId: 'FEmusic_home',
          context: {
            client: {
              clientName: 'WEB_REMIX',
              clientVersion: '1.20240101.01.00',
              hl: 'en',
              gl: 'US',
            },
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
        }
      );

      return this.parseHomeFeed(response.data);
    } catch (error: any) {
      if (error.response) {
        console.error('[YouTubeMusic] Detailed InnerTube Error response:', JSON.stringify(error.response.data, null, 2));
      }
      throw error;
    }
  }

  private parseHomeFeed(data: any): YtShelf[] {
    const shelves: YtShelf[] = [];
    
    try {
      const sections = data.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents;
      if (!sections || !Array.isArray(sections)) return shelves;

      for (const section of sections) {
        const shelfRenderer = section.musicCarouselShelfRenderer || section.musicShelfRenderer;
        if (!shelfRenderer) continue;

        // Shelf Title
        let title = '';
        if (shelfRenderer.header?.musicHeaderRenderer?.title?.runs?.[0]?.text) {
          title = shelfRenderer.header.musicHeaderRenderer.title.runs[0].text;
        } else if (shelfRenderer.header?.musicCarouselShelfBasicHeaderRenderer?.title?.runs?.[0]?.text) {
          title = shelfRenderer.header.musicCarouselShelfBasicHeaderRenderer.title.runs[0].text;
        } else if (shelfRenderer.title?.runs?.[0]?.text) {
          title = shelfRenderer.title.runs[0].text;
        }

        if (!title) continue;

        const items: YtShelfItem[] = [];
        const contents = shelfRenderer.contents;

        if (Array.isArray(contents)) {
          for (const itemNode of contents) {
            const r = itemNode.musicTwoRowItemRenderer || itemNode.musicResponsiveListItemRenderer;
            if (!r) continue;

            // Thumbnail
            let thumbnail = '';
            const thumbnails = r.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || r.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails;
            if (thumbnails && thumbnails.length > 0) {
              thumbnail = thumbnails[thumbnails.length - 1].url; // highest resolution
            }

            // Title
            let itemTitle = '';
            if (r.title?.runs?.[0]?.text) {
              itemTitle = r.title.runs[0].text;
            }

            // Subtitle / Artists
            let subtitle = '';
            if (r.subtitle?.runs) {
              subtitle = r.subtitle.runs.map((run: any) => run.text).join('');
            } else if (r.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs) {
              subtitle = r.flexColumns[1].musicResponsiveListItemFlexColumnRenderer.text.runs.map((run: any) => run.text).join('');
            }

            // Navigation / IDs
            let type: 'track' | 'playlist' | 'album' = 'track';
            let id = '';

            const navEndpoint = r.navigationEndpoint || r.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint;
            if (navEndpoint) {
              if (navEndpoint.watchEndpoint) {
                type = 'track';
                id = navEndpoint.watchEndpoint.videoId;
              } else if (navEndpoint.browseEndpoint) {
                const pageType = navEndpoint.browseEndpoint.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType;
                if (pageType === 'MUSIC_PAGE_TYPE_ALBUM') {
                  type = 'album';
                  id = navEndpoint.browseEndpoint.browseId;
                } else if (pageType === 'MUSIC_PAGE_TYPE_PLAYLIST') {
                  type = 'playlist';
                  id = navEndpoint.browseEndpoint.browseId;
                } else {
                  // Fallback
                  id = navEndpoint.browseEndpoint.browseId;
                  type = id.startsWith('FIBPRE') || id.startsWith('PL') ? 'playlist' : 'album';
                }
              } else if (navEndpoint.watchPlaylistEndpoint) {
                type = 'playlist';
                id = navEndpoint.watchPlaylistEndpoint.playlistId;
              }
            }

            if (itemTitle && id) {
              items.push({ type, id, title: itemTitle, subtitle, thumbnail });
            }
          }
        }

        if (items.length > 0) {
          shelves.push({ title, items });
        }
      }
    } catch (e) {
      console.error('[YouTubeMusic] Error parsing home feed JSON:', e);
    }

    return shelves;
  }

  async searchTracks(query: string): Promise<any[]> {
    try {
      const response = await axios.post(
        `${this.innerTubeUrl}/search?key=${this.apiKey}`,
        {
          query: query,
          params: 'EgWKAQIIAWoKEAkQBRAKEAMQHg%3D%3D', // Filter to Songs to fetch duration and album names
          context: {
            client: {
              clientName: 'WEB_REMIX',
              clientVersion: '1.20240101.01.00',
              hl: 'en',
              gl: 'US',
            },
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
        }
      );

      const tracks: any[] = [];
      const contents = response.data.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents;
      
      if (contents && Array.isArray(contents)) {
        for (const section of contents) {
          const shelf = section.musicShelfRenderer || section.itemSectionRenderer;
          if (shelf && shelf.contents && Array.isArray(shelf.contents)) {
            for (const item of shelf.contents) {
              const r = item.musicResponsiveListItemRenderer;
              if (!r) continue;

              const title = r.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text;
              if (!title) continue;

              let videoId = r.playlistItemData?.videoId;
              if (!videoId) {
                const navEndpoint = r.navigationEndpoint || r.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint;
                if (navEndpoint?.watchEndpoint?.videoId) {
                  videoId = navEndpoint.watchEndpoint.videoId;
                }
              }

              if (!videoId) continue;

              const subtitleRuns = r.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs;
              let artistName = 'Unknown Artist';
              let albumName = 'Unknown Album';
              let durationMs = 180000; // fallback 3:00
              
              if (subtitleRuns && Array.isArray(subtitleRuns)) {
                const textLine = subtitleRuns.map((x: any) => x.text).join('');
                const parts = textLine.split(/\s*•\s*/).map((p: string) => p.trim());
                
                if (parts.length > 0) {
                  const lastPart = parts[parts.length - 1];
                  let hasDuration = false;
                  
                  // Check if the last run is a timestamp (e.g., 3:45 or 10:13)
                  if (/^\d{1,2}:\d{2}$|^\d{1,2}:\d{2}:\d{2}$/.test(lastPart)) {
                    hasDuration = true;
                    const timeParts = lastPart.split(':').map(Number);
                    if (timeParts.length === 2) {
                      durationMs = (timeParts[0] * 60 + timeParts[1]) * 1000;
                    } else if (timeParts.length === 3) {
                      durationMs = (timeParts[0] * 3600 + timeParts[1] * 60 + timeParts[2]) * 1000;
                    }
                  }

                  // Artist is usually the first part
                  artistName = parts[0] || 'Unknown Artist';

                  // If we have 3 parts and the last one is duration, the middle one is the album
                  if (parts.length === 3 && hasDuration) {
                    albumName = parts[1];
                  } else if (parts.length === 2) {
                    if (hasDuration) {
                      albumName = 'Single';
                    } else {
                      albumName = parts[1];
                    }
                  } else if (parts.length > 3 && hasDuration) {
                    // Handing multiple artists (e.g. Artist 1, Artist 2 • Album • Duration)
                    albumName = parts[parts.length - 2];
                  }
                }
              }

              let thumbnail = '';
              const thumbnails = r.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || r.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails;
              if (thumbnails && thumbnails.length > 0) {
                thumbnail = thumbnails[thumbnails.length - 1].url;
              }

              let explicit = false;
              if (r.badges && Array.isArray(r.badges)) {
                explicit = r.badges.some(
                  (b: any) => b.musicInlineBadgeRenderer?.icon?.iconType === 'MUSIC_EXPLICIT_BADGE'
                );
              }

              tracks.push({
                id: videoId,
                name: title,
                artists: [{ id: 'youtube', name: artistName }],
                album: {
                  id: 'youtube',
                  name: albumName,
                  imageUrl: thumbnail || null,
                  releaseDate: null,
                },
                durationMs: durationMs,
                explicit: explicit,
                isrc: null,
                spotifyUrl: `https://music.youtube.com/watch?v=${videoId}`,
                previewUrl: null,
              });
            }
          }
        }
      }

      return tracks;
    } catch (error) {
      console.error('[YouTubeMusic] Search error:', error);
      return [];
    }
  }
}

export const youtubeMusicService = new YoutubeMusicService();
