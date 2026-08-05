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
  strapline?: string;
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

  private findAllChips(obj: any): any[] {
    const list: any[] = [];
    function recurse(current: any) {
      if (!current || typeof current !== 'object') return;
      if (current.chipCloudChipRenderer) {
        list.push(current.chipCloudChipRenderer);
        return;
      }
      if (Array.isArray(current)) {
        for (const item of current) {
          recurse(item);
        }
      } else {
        for (const key of Object.keys(current)) {
          recurse(current[key]);
        }
      }
    }
    recurse(obj);
    return list;
  }

  async fetchHomeFeed(_userId: string, params?: string): Promise<{ shelves: YtShelf[], chips: { text: string, params: string }[] }> {
    try {
      const payload: any = {
        browseId: 'FEmusic_home',
        context: {
          client: {
            clientName: 'WEB_REMIX',
            clientVersion: '1.20240101.01.00',
            hl: 'en',
            gl: 'US',
          },
        },
      };

      if (params) {
        payload.params = params;
      }

      const response = await axios.post(
        `${this.innerTubeUrl}/browse?key=${this.apiKey}`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
        }
      );

      const data = response.data;
      const shelves = this.parseHomeFeed(data);
      
      const parsedChips: { text: string, params: string }[] = [];
      const rawChips = this.findAllChips(data);
      for (const c of rawChips) {
        const text = c.text?.runs?.[0]?.text || c.text?.simpleText;
        const p = c.navigationEndpoint?.browseEndpoint?.params;
        if (text && p) {
          parsedChips.push({ text, params: p });
        }
      }

      return { shelves, chips: parsedChips };
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

        // Shelf Title & Strapline
        let title = '';
        let strapline = '';
        const header = shelfRenderer.header?.musicHeaderRenderer || shelfRenderer.header?.musicCarouselShelfBasicHeaderRenderer;
        
        if (header?.title?.runs?.[0]?.text) {
          title = header.title.runs[0].text;
        } else if (shelfRenderer.title?.runs?.[0]?.text) {
          title = shelfRenderer.title.runs[0].text;
        }

        if (header?.strapline?.runs?.[0]?.text) {
          strapline = header.strapline.runs[0].text;
        } else if (shelfRenderer.strapline?.runs?.[0]?.text) {
          strapline = shelfRenderer.strapline.runs[0].text;
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
          shelves.push({ title, strapline: strapline || undefined, items });
        }
      }
    } catch (e) {
      console.error('[YouTubeMusic] Error parsing home feed JSON:', e);
    }

    return shelves;
  }

  private findAllTracks(obj: any): any[] {
    const list: any[] = [];
    function recurse(current: any) {
      if (!current || typeof current !== 'object') return;
      if (current.musicResponsiveListItemRenderer) {
        list.push(current.musicResponsiveListItemRenderer);
        return;
      }
      if (Array.isArray(current)) {
        for (const item of current) {
          recurse(item);
        }
      } else {
        for (const key of Object.keys(current)) {
          recurse(current[key]);
        }
      }
    }
    recurse(obj);
    return list;
  }

  async fetchPlaylist(playlistId: string, overrideTitle?: string): Promise<{ name: string; description: string; imageUrl: string; tracks: any[] }> {
    try {
      const mappings: Record<string, string> = {
        // Rain Therapy shelf
        "search_Bollywood_Romantic_Moments": "VLPLutE3kyv67T5OUhCteC6NxvbI952E41aP",
        "search_Uncut_Bollywood": "VLPLTP4IXDq-5R9MgveXVTj3p36EtL-rMJ6X",
        "search_80s_Bollywood_Romance": "VLRDCLAK5uy_mP4pii3gdJ6A8EhnMZ8mCUlay7NyZnh6I",
        "search_00s_Bollywood_Romance": "VLRDCLAK5uy_kWKAcJROkxDk9mOVmfDSv9cycK_-Ci2yA",
        "search_Ishq_Sufiyana": "VLRDCLAK5uy_kt3gC0XuT4rhFT3nXCLAhprwdQ0xieyYA",
        "search_Bollywood_Romance_Hitlist": "VLRDCLAK5uy_miAacfMxVybbt7ketqqnPPbH9LDn1TavU",
        
        // Easy Mornings shelf
        "search_Punjabi_Hip_Hop_Hits": "VLPLZObc0sy5xgP5M2G8LCtPm2YwSh498Y2l",
        "search_Easy_Mornings_Hindi": "VLRDCLAK5uy_nJmrf-yTYuev_gOBz1TNCIZoFWW5zHNTg",
        "search_Upbeat_Bollywood": "VLRDCLAK5uy_k9HcddP6GLGC2jKjAp9wSVu3G_T73UYSw",
        "search_Bhajan_Clubbing": "VLPLTtW8q-La8OXL8PLSurXdB3RT32o-f_G_",
        "search_Pump_Up_Pop": "VLPLixEHoxwFm7t7R9FewDXrOvLfxKAeIkc9",
        "search_Singing_in_the_Shower_Hindi": "VLRDCLAK5uy_kOSzQSKxMWOxW7_0w7EHX4zJQ8jH4snYE",
      };

      if (mappings[playlistId]) {
        playlistId = mappings[playlistId];
      } else if (playlistId.startsWith('search_')) {
        const query = playlistId.replace('search_', '').replace(/_/g, ' ');
        const resolvedPlaylists = await this.searchPlaylists(query);
        if (resolvedPlaylists && resolvedPlaylists.length > 0) {
          playlistId = resolvedPlaylists[0].id;
        }
      }

      // Ensure the playlist ID has the 'VL' prefix for the InnerTube browse API
      let browseId = playlistId;
      if (!browseId.startsWith('VL')) {
        browseId = 'VL' + browseId;
      }

      const response = await axios.post(
        `${this.innerTubeUrl}/browse?key=${this.apiKey}`,
        {
          browseId,
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

      const data = response.data;
      let name = overrideTitle || 'YouTube Playlist';
      let description = '';
      let imageUrl = '';

      const micro = data.microformat?.microformatDataRenderer;
      if (micro) {
        if (micro.title && !overrideTitle) name = micro.title;
        if (micro.description) description = micro.description;
        if (micro.thumbnail?.thumbnails?.[0]?.url) {
          imageUrl = micro.thumbnail.thumbnails[0].url;
        }
      }

      const header = data.header?.musicHeaderRenderer || 
                     data.header?.musicDetailHeaderRenderer || 
                     data.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents?.[0]?.musicResponsiveHeaderRenderer;
      
      if (header) {
        if (header.title?.runs?.[0]?.text && !overrideTitle) {
          name = header.title.runs[0].text;
        }
        if (header.description?.runs?.[0]?.text) {
          description = header.description.runs[0].text;
        }
        const thumbnails = header.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails;
        if (thumbnails && thumbnails.length > 0) {
          imageUrl = thumbnails[thumbnails.length - 1].url;
        }
      }

      const rawTracks = this.findAllTracks(data);
      const tracks: any[] = [];

      for (const r of rawTracks) {
        let videoId = r.playlistItemData?.videoId;
        if (!videoId) {
          const navEndpoint = r.navigationEndpoint || r.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint;
          if (navEndpoint?.watchEndpoint?.videoId) {
            videoId = navEndpoint.watchEndpoint.videoId;
          }
        }
        if (!videoId) continue;

        let title = '';
        if (r.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text) {
          title = r.flexColumns[0].musicResponsiveListItemFlexColumnRenderer.text.runs[0].text;
        }

        let artistName = 'Unknown Artist';
        if (r.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs) {
          artistName = r.flexColumns[1].musicResponsiveListItemFlexColumnRenderer.text.runs
            .map((run: any) => run.text)
            .join('')
            .trim();
        }

        let albumName = 'Unknown Album';
        if (r.flexColumns?.[2]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text) {
          albumName = r.flexColumns[2].musicResponsiveListItemFlexColumnRenderer.text.runs[0].text;
        } else if (r.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs) {
          const runs = r.flexColumns[1].musicResponsiveListItemFlexColumnRenderer.text.runs;
          const textLine = runs.map((x: any) => x.text).join('');
          const parts = textLine.split(/\s*•\s*/).map((p: string) => p.trim());
          if (parts.length > 1) {
            albumName = parts[1];
          }
        }

        let durationMs = 0;
        if (r.fixedColumns) {
          for (const col of r.fixedColumns) {
            const text = col.musicResponsiveListItemFixedColumnRenderer?.text?.runs?.[0]?.text;
            if (text && /^\d{1,2}:\d{2}$|^\d{1,2}:\d{2}:\d{2}$/.test(text)) {
              const t = text.split(':').map(Number);
              if (t.length === 2) durationMs = (t[0] * 60 + t[1]) * 1000;
              else if (t.length === 3) durationMs = (t[0] * 3600 + t[1] * 60 + t[2]) * 1000;
              break;
            }
          }
        }
        if (durationMs === 0 && r.flexColumns) {
          for (const col of r.flexColumns) {
            const runs = col.musicResponsiveListItemFlexColumnRenderer?.text?.runs;
            if (Array.isArray(runs)) {
              for (const run of runs) {
                const text = run.text?.trim();
                if (text && /^\d{1,2}:\d{2}$|^\d{1,2}:\d{2}:\d{2}$/.test(text)) {
                  const t = text.split(':').map(Number);
                  if (t.length === 2) durationMs = (t[0] * 60 + t[1]) * 1000;
                  else if (t.length === 3) durationMs = (t[0] * 3600 + t[1] * 60 + t[2]) * 1000;
                  break;
                }
              }
            }
          }
        }

        let thumbnail = '';
        const thumbnails = r.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || r.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails;
        if (thumbnails && thumbnails.length > 0) {
          thumbnail = thumbnails[thumbnails.length - 1].url;
        }

        tracks.push({
          id: `yt-${videoId}`,
          name: title,
          artists: [{ id: 'youtube', name: artistName }],
          album: {
            id: 'youtube',
            name: albumName,
            imageUrl: thumbnail || null,
            releaseDate: null,
          },
          durationMs: durationMs || 180000,
          explicit: false,
          isrc: null,
          spotifyUrl: `https://www.youtube.com/watch?v=${videoId}`,
          previewUrl: null,
        });
      }

      if (!imageUrl && tracks.length > 0 && tracks[0].album?.imageUrl) {
        imageUrl = tracks[0].album.imageUrl;
      }

      // If no tracks were found (e.g. invalid/deleted/private playlist ID or unparseable playlist),
      // perform automatic fallback search for playlists or tracks so the playlist page is never empty!
      if (tracks.length === 0) {
        let searchQuery = name && name !== 'YouTube Playlist' ? name : '';
        if (!searchQuery) {
          searchQuery = playlistId
            .replace(/^search_|^VL|^PL/, '')
            .replace(/_/g, ' ')
            .trim();
        }
        // If searchQuery still looks like an opaque playlist ID hash or is empty, use a popular fallback query
        if (!searchQuery || /^[A-Za-z0-9_-]{10,}$/.test(searchQuery) || /^PL[A-Za-z0-9_-]+/.test(searchQuery)) {
          searchQuery = 'Bollywood Romantic Hits';
        }

        console.log(`[YouTubeMusic] 0 tracks for ${playlistId}. Attempting fallback search for: "${searchQuery}"`);

        // 1. Try finding an active playlist with this query
        const candidates = await this.searchPlaylists(searchQuery);
        // Prioritize actual playlist IDs starting with VL, PL, VLRD
        const validCandidates = candidates.filter(c => c.id !== playlistId && (c.id.startsWith('VL') || c.id.startsWith('PL') || c.id.startsWith('RD')));
        
        for (const candidate of validCandidates) {
          try {
            const candBrowseId = candidate.id.startsWith('VL') ? candidate.id : 'VL' + candidate.id;
            const candRes = await axios.post(
              `${this.innerTubeUrl}/browse?key=${this.apiKey}`,
              {
                browseId: candBrowseId,
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

            const candRawTracks = this.findAllTracks(candRes.data);
            if (candRawTracks.length > 0) {
              console.log(`[YouTubeMusic] Fallback found ${candRawTracks.length} tracks from candidate playlist ${candidate.id}`);
              const fallbackPlaylist = await this.fetchPlaylist(candidate.id, overrideTitle || name);
              if (fallbackPlaylist.tracks.length > 0) {
                return {
                  name: overrideTitle || (name !== 'YouTube Playlist' ? name : candidate.title || searchQuery),
                  description: fallbackPlaylist.description || description,
                  imageUrl: fallbackPlaylist.imageUrl || imageUrl,
                  tracks: fallbackPlaylist.tracks
                };
              }
            }
          } catch (e) {
            // Ignore candidate error and continue
          }
        }

        // 2. If no valid playlist candidate worked, search tracks directly
        const searchedTracks = await this.searchTracks(searchQuery);
        if (searchedTracks.length > 0) {
          console.log(`[YouTubeMusic] Fallback found ${searchedTracks.length} tracks via track search for "${searchQuery}"`);
          return {
            name: overrideTitle || (name !== 'YouTube Playlist' ? name : searchQuery),
            description: `YouTube Music Mix for ${searchQuery}`,
            imageUrl: searchedTracks[0].album?.imageUrl || imageUrl,
            tracks: searchedTracks
          };
        }
      }

      return {
        name,
        description,
        imageUrl,
        tracks,
      };
    } catch (error) {
      console.error('[YouTubeMusic] Fetch playlist error:', error);
      throw error;
    }
  }

  async searchPlaylists(query: string): Promise<any[]> {
    try {
      const response = await axios.post(
        `${this.innerTubeUrl}/search?key=${this.apiKey}`,
        {
          query: query,
          params: 'Eg-KAQwIADABGgQIAhAB', // Filter to Playlists
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

      const playlists: any[] = [];
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

              const navEndpoint = r.navigationEndpoint || r.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint;
              const playlistId = navEndpoint?.browseEndpoint?.browseId;
              if (playlistId) {
                playlists.push({ id: playlistId, title });
              }
            }
          }
        }
      }
      return playlists;
    } catch (e) {
      console.error('[YouTubeMusic] Error searching playlists:', e);
      return [];
    }
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
