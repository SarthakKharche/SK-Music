import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiPlay, FiMusic, FiDownload, FiCheck } from 'react-icons/fi';
import api from '../utils/api';
import { usePlayer } from '../contexts/PlayerContext';
import { useOffline } from '../contexts/OfflineContext';
import { audioCacheManager } from '../services/audioCacheManager';
import type { Track } from '../types';

interface YtShelfItem {
  type: 'track' | 'playlist' | 'album';
  id: string;
  title: string;
  subtitle: string;
  thumbnail: string;
}

interface YtShelf {
  title: string;
  strapline?: string;
  items: YtShelfItem[];
}

interface YtChip {
  text: string;
  params: string;
}

const DEFAULT_SHELVES: YtShelf[] = [
  {
    title: "Quick picks",
    strapline: "START RADIO FROM ANY SONG",
    items: [
      {
        id: "zAiIgYOH4Ys",
        type: "track",
        title: "KALYANI (Remix)",
        subtitle: "ARJN, KDS, FIFTY4 & Shreya Ghoshal • 183M plays",
        thumbnail: "https://lh3.googleusercontent.com/naKgO_9vvIczuf7Vq1llQyRAQOOW898kBZN3pio-Bkbfcmdu3Gv14_ivEBZiHAow8VbPEq1bhO0j2DU=w120-h120-l90-rj"
      },
      {
        id: "kyqJ_FId-_w",
        type: "track",
        title: "Bairan",
        subtitle: "Banjaare • 586M plays • Bairan",
        thumbnail: "https://lh3.googleusercontent.com/LF_Gw__z3R6L4Mbz1cW7RDKXYiNcYTxBR2QrrWk0gXgUDhv9uOx01XLtvlmf4PGBISXNIlp2r0XxLU_2=w120-h120-l90-rj"
      },
      {
        id: "ffqliB42Nh4",
        type: "track",
        title: "We Don't Talk Anymore (feat. Selena Gomez)",
        subtitle: "Charlie Puth • 4.4B plays • Nine Track Mind",
        thumbnail: "https://lh3.googleusercontent.com/TlXKDSRGrj0ogqmGbzyGvZrsT9T0F6xgV-2-3pelbzRms0cODdb-ndDg6SpFzkHYMb4NMMMW957wmrObfw=w120-h120-l90-rj"
      },
      {
        id: "plqIksy6HEg",
        type: "track",
        title: "Ishq Jalakar - Karvaan (From \"Dhurandhar\")",
        subtitle: "Shashwat Sachdev, Shahzad Ali, Subhadeep Das Chowdhury & Armaan Khan • 235M plays",
        thumbnail: "https://lh3.googleusercontent.com/rR1OMwUaMSUBLS_yzPNiUzgBWaxtBSys8dahPXONq8qOPZ1JQp6BcDL3WGKB9tBIlfi8wLZ0yFpOJno=w120-h120-l90-rj"
      },
      {
        id: "SBOwcGnwuKM",
        type: "track",
        title: "Udi Udi",
        subtitle: "Aneesh, Sarkar & Hruday • 80M plays • Udi Udi",
        thumbnail: "https://lh3.googleusercontent.com/0ifsHj6e3RLiNbXb95WJ1DqwA62h181vbvYGusB-O-S6aUQcDqu2HTtZ_7E49QiIOfbjssJVUpY50nk=w120-h120-l90-rj"
      },
      {
        id: "8BiLurrzFRw",
        type: "track",
        title: "Night Changes",
        subtitle: "One Direction • 1.7B plays • FOUR (Deluxe)",
        thumbnail: "https://lh3.googleusercontent.com/fyfca39b6OXF-CpPJqI9ykwo9djxZROQcbAMfnO-oE7Yr4PLxpWZazQjW49qpW2I293WC6_ddDQyHe4=w120-h120-l90-rj"
      },
      {
        id: "ORrFJ63nlcA",
        type: "track",
        title: "Perfect",
        subtitle: "Ed Sheeran • 6.5B plays • ÷ (Deluxe)",
        thumbnail: "https://lh3.googleusercontent.com/xpDEOr2TeqEn1QpXosXhqtj149FzNnTgAG3oqPnpTxTbQk-oceO90Sz4Axq0s4Jp_QLGQha_um6_EG3WGQ=w120-h120-l90-rj"
      },
      {
        id: "rJ0D1GbDq1Q",
        type: "track",
        title: "Let Me Love You (feat. Justin Bieber)",
        subtitle: "DJ Snake • 4.3B plays • Encore",
        thumbnail: "https://lh3.googleusercontent.com/hChcdJkpKRDaaowWQhFxc4ZK7_jcDqQydpG8NUXbyPQUxMNYzpgLhVdU-csAFhcGhi-mYPiFZGR3cQmK=w120-h120-l90-rj"
      },
      {
        id: "jLO0liDHfKY",
        type: "track",
        title: "Dil Pe Zakham Khate Hain",
        subtitle: "Nusrat Fateh Ali Khan • 114M plays • Revamped, Vol. 3 (Remix)",
        thumbnail: "https://lh3.googleusercontent.com/hpTtc0nsMVe3BimuBAvsmSWDwgyxUXDLriIBX9rlmluLe2Qldkrn0B-0JTLCH5AFhUZ9QRHihFKiuOA=w120-h120-l90-rj"
      },
      {
        id: "6bGmUTAfh-A",
        type: "track",
        title: "Let Her Go",
        subtitle: "Passenger • 5.2B plays • All The Little Lights",
        thumbnail: "https://lh3.googleusercontent.com/mq5bRH-gEbLS9AxytuTZ5YlyW5h2GIBgzSatzU9eI7NsRUpcKov89F0xM5ZXIr49X4XY5BeqpbdbRs86nQ=w120-h120-l90-rj"
      },
      {
        id: "F_-UuraWCFY",
        type: "track",
        title: "Ramba Ho-ho-ho Samba Ho-ho-ho",
        subtitle: "Usha Uthup • 9.6M plays • Saregama Tailoring - Disco Jacket",
        thumbnail: "https://lh3.googleusercontent.com/g0q-Ue8-9TipJH1iVSPJwaLbefPaA9jM7kRgSu-Xx3bORBALf-sVlAIKzJcZ3VkJiq3a56U51cle35eh=w120-h120-l90-rj"
      },
      {
        id: "PLpXDWKFCXMCvdaKNLPOAoU9kiGfcqei7S",
        type: "track",
        title: "a última dança",
        subtitle: "Link do Zap & plug • a última dança",
        thumbnail: "https://lh3.googleusercontent.com/mM6sYCuv_yp1YNRjd2aH4-zQiwTC3x6pBRqKTYoVlJg41XdJZhGCCf5IWobBSp6SqKvTUPUsW-TYiX9DsA=w120-h120-l90-rj"
      }
    ]
  },
  {
    title: "Rain Therapy 🍀🌧️",
    strapline: "FOR COZY DAYS AND ENDLESS CUPS OF TEA",
    items: [
      {
        id: "VLPLutE3kyv67T5OUhCteC6NxvbI952E41aP",
        type: "playlist",
        title: "Bollywood Romantic Moments",
        subtitle: "Arijit Singh, Pritam, Vishal Mishra, Amitabh Bhattacharya",
        thumbnail: "https://yt3.googleusercontent.com/8ZlKgHejosXBshrwF0O80mSkgENrofPitQk_skSXhOV3sw3TSZA7jZYtAVQMcDmIi2H9nMFNq0E=s1200"
      },
      {
        id: "VLPLTP4IXDq-5R9MgveXVTj3p36EtL-rMJ6X",
        type: "playlist",
        title: "Uncut Bollywood",
        subtitle: "Arijit Singh, Pritam, Shreya Ghoshal, Amitabh Bhattacharya",
        thumbnail: "https://yt3.googleusercontent.com/XesBmIrYYfWu3RrwQGEwWys6sq3WVCvafzIFBrsndMD6A-HvHOR1s2RCOjYh3ZxTYGKH4P0ihg=s1200"
      },
      {
        id: "VLRDCLAK5uy_mP4pii3gdJ6A8EhnMZ8mCUlay7NyZnh6I",
        type: "playlist",
        title: "80s Bollywood Romance",
        subtitle: "Lata Mangeshkar, Kishore Kumar, Asha Bhosle, R. D. Burman",
        thumbnail: "https://yt3.googleusercontent.com/c8qj4_6Y37juQt0ycPqAFmu-nkQPo6PhziUMMF-mF4NLSmCUAX_RhuwtCWz1GlpV1G4H7rN68PJ1XEk=w544-h544-l90-rj"
      },
      {
        id: "VLRDCLAK5uy_kWKAcJROkxDk9mOVmfDSv9cycK_-Ci2yA",
        type: "playlist",
        title: "00s Bollywood Romance",
        subtitle: "Alka Yagnik, Pritam, Shreya Ghoshal, Udit Narayan",
        thumbnail: "https://yt3.googleusercontent.com/nMAW4OkV_cPtnnfXNjs0ORDsODpA3UFgecGs0VhLqj7oiPHyNf7jZxKX4yFwsGajm9vS8UWmy0yZSys6=w544-h544-l90-rj"
      },
      {
        id: "VLRDCLAK5uy_kt3gC0XuT4rhFT3nXCLAhprwdQ0xieyYA",
        type: "playlist",
        title: "Ishq Sufiyana",
        subtitle: "Arijit Singh, Pritam, Rahat Fateh Ali Khan, Shreya Ghoshal",
        thumbnail: "https://yt3.googleusercontent.com/tpqWpwWb2JoXKjJiMTQefR49ZDn6IZ0wPiSItwJyIyh09dAl0BQfE7Xay4p5zIENq52uSbdmd_Nbjda0=w544-h544-l90-rj"
      },
      {
        id: "VLRDCLAK5uy_miAacfMxVybbt7ketqqnPPbH9LDn1TavU",
        type: "playlist",
        title: "Bollywood Romance Hitlist",
        subtitle: "Arijit Singh, Amitabh Bhattacharya, Irshad Kamil",
        thumbnail: "https://yt3.googleusercontent.com/HEdSa36FoDLbUaGWynkGzG_QFFElSh2RpOF4UOXgPwWTUkbqynoWw8W5trrQAnQM76PgryWuXYTLMgw=w544-h544-l90-rj"
      }
    ]
  },
  {
    title: "Easy Mornings",
    strapline: "PEPPY MUSIC TO START YOUR DAY",
    items: [
      {
        id: "VLPLZObc0sy5xgP5M2G8LCtPm2YwSh498Y2l",
        type: "playlist",
        title: "Punjabi Hip Hop Hits",
        subtitle: "Shubh, Karan Aujla, Sidhu Moose Wala, Mxrci",
        thumbnail: "https://yt3.googleusercontent.com/yWTtn7QCkU8f2yokta4qSoA1odOg7kr09WHOdDYwLYZnejGSOf50LeXbugvo3zd9Qdqo6Q3tMw=s1200"
      },
      {
        id: "VLRDCLAK5uy_nJmrf-yTYuev_gOBz1TNCIZoFWW5zHNTg",
        type: "playlist",
        title: "Easy Mornings: Hindi",
        subtitle: "Arijit Singh, Pritam, Shreya Ghoshal, Amitabh Bhattacharya",
        thumbnail: "https://yt3.googleusercontent.com/C6iScC5xv5FX9mDmVGwZVjHcxcINIKFor22QEyF1jxlFDxUm3jbnX9flT7zWhmD_yGqu0j6JJ42bGt0=w544-h544-l90-rj"
      },
      {
        id: "VLRDCLAK5uy_k9HcddP6GLGC2jKjAp9wSVu3G_T73UYSw",
        type: "playlist",
        title: "Upbeat Bollywood",
        subtitle: "Tanishk Bagchi, Badshah, Nikhita Gandhi, Arijit Singh",
        thumbnail: "https://yt3.googleusercontent.com/AjLGiy9_2pgokNxdHZMHsWMVBkeajknzFxztAdFX13PoxkEI7h860UzWxPeI_OVh5qaftbuSK6nzwApy=w544-h544-l90-rj"
      },
      {
        id: "VLPLTtW8q-La8OXL8PLSurXdB3RT32o-f_G_",
        type: "playlist",
        title: "Bhajan Clubbing",
        subtitle: "Jubin Nautiyal, Hansraj Raghuwanshi, Sachet Tandon",
        thumbnail: "https://i.ytimg.com/vi/9FSHCY0U7_0/hq720.jpg"
      },
      {
        id: "VLPLixEHoxwFm7t7R9FewDXrOvLfxKAeIkc9",
        type: "playlist",
        title: "Pump-Up Pop",
        subtitle: "Dua Lipa, Calvin Harris, The Chainsmokers, The Weeknd",
        thumbnail: "https://yt3.googleusercontent.com/1MtlrHt284hbX8W5apyZfUrZVZOvSA-aK3TnIxPsK9_xGyxWJ3yCpBxR7Z6Y95tr6lbuHxgmOg=s1200"
      },
      {
        id: "VLRDCLAK5uy_kOSzQSKxMWOxW7_0w7EHX4zJQ8jH4snYE",
        type: "playlist",
        title: "Singing in the Shower: Hindi",
        subtitle: "A. R. Rahman, Pritam, Shreya Ghoshal, Sonu Nigam",
        thumbnail: "https://yt3.googleusercontent.com/Br5V4XVzbhABQpPJ6MyZ7Qa_2ZEFRgvU8V6YTqHOJAJf50JKB8lHazBpzP6i51GQSu1Hl85dV0u8ow=w544-h544-l90-rj"
      }
    ]
  },
  {
    title: "Trending community playlists",
    items: [
      {
        id: "VLPLnZyuhxl5jzMtyvxwzWj08nWo3MO74LTD",
        type: "playlist",
        title: "love",
        subtitle: "Jayashri Vedpathak • 302K views",
        thumbnail: "https://yt3.googleusercontent.com/vN1Yu1-ZI58H1VNiOWqujqjLspc89mfRGInqjXprkk0AAGGCwpQLKglMzjcsOr-cMomtyHUXFJo=s1200"
      },
      {
        id: "VLPLfJC-Hett9qCYegKw3GNBzMC9FaUXLrmo",
        type: "playlist",
        title: "1990 super hit songs",
        subtitle: "Ashokkumar Chhipa • 7.4M views",
        thumbnail: "https://yt3.googleusercontent.com/3jLfRiqlajhI_thVLNrHI-GYvt8evgO8UAn9eK6hr371_5SStwvvWjiSU8Vvn6Hu_T8Vr12JmXTroJr_=w544-h544-l90-rj"
      },
      {
        id: "VLPLz0HVvbtUDlizyPzX2KrMsVWZF5Cz-HVa",
        type: "playlist",
        title: "Hindi song ✨",
        subtitle: "creative world 🖤 • 14M views",
        thumbnail: "https://yt3.googleusercontent.com/kIOowNy9fiUhkgh0N5Uc2PqGqaskwU0wiOkRI14H0-fOjx3NkMGCnUBb2gptmGe4hOwk5vMzsIQ5XQ=w544-h544-l90-rj"
      },
      {
        id: "VLRDCLAK5uy_n9X3m-MvN0E4U51c4r7YvN0Bw9E4y5t_wE1",
        type: "playlist",
        title: "smooth song",
        subtitle: "Baskin Robbins Emp • 970K views",
        thumbnail: "https://yt3.googleusercontent.com/8RyphLch178xKB58QSsrN8IkiZt4slZkqoxnGssljcoMSReew4wi1JXIvyrmP_Gyl5Zo2fuZ-awrORRY=w544-h544-l90-rj"
      },
      {
        id: "VLPLioBJFKuAm7xrVmr_81Yo04bhekDqVY_f",
        type: "playlist",
        title: "peace",
        subtitle: "AYUSH PAUL • 1.1M views",
        thumbnail: "https://yt3.googleusercontent.com/8IHpiJAt5jG1ozMs6NoWrtzTDMQzJFQAgwDDAdc7oIGuSXLwtay_1KJDok2o94NqD4N7avdad46W=s1200"
      },
      {
        id: "VLPLnh-EPxIaSPLXCIo1rMCw1F2My4a3xsqG",
        type: "playlist",
        title: "My mediaeval",
        subtitle: "Satpal Rana • 678K views",
        thumbnail: "https://yt3.googleusercontent.com/srOof2Yd6gMtlQPyDqUPPrSBa5juGPb0Bs2mf1HbcoBo8LBI701DfFM39SrfCdOlgolD74rYStH_=s1200"
      }
    ]
  },
  {
    title: "Dancing on your own",
    strapline: "DANCE YOUR STRESS AWAY",
    items: [
      {
        id: "VLPL_75soKFr-Q2gyQCjluqpI9gIapiecPYw",
        type: "playlist",
        title: "Bollywood Fire",
        subtitle: "Amitabh Bhattacharya, Sachin-Jigar, Tanishk Bagchi",
        thumbnail: "https://yt3.googleusercontent.com/7Zsektrtwnf2UlL5CWGtSxi8JDfT8h4me73j31Mk-bDe5qbfUz7dtt1MUy-QlwkaGBWaIXucHF-r2KiCUQ=w544-h544-l90-rj"
      },
      {
        id: "VLRDCLAK5uy_n-JqN0E4U51c4r7YvN0Bw9E4y5t_wE1w8",
        type: "playlist",
        title: "Bollywood Party",
        subtitle: "Shashwat Sachdev, Badshah, Tanishk Bagchi",
        thumbnail: "https://yt3.googleusercontent.com/k8T1iodf5nMMksDlIjS7z0T4uUGi0IWvfzz6H2QgFHs1lv9kjgd5gXRs05lC7TBP_Csv4dsu0K8nr3yqRA=w544-h544-l90-rj"
      },
      {
        id: "VLRDCLAK5uy_lyylT-tCGnMJke5TqnEeNrewWCAhDfzp8",
        type: "playlist",
        title: "Punjabi Party",
        subtitle: "Karan Aujla, Diljit Dosanjh, Guru Randhawa",
        thumbnail: "https://yt3.googleusercontent.com/1cHzBa4iTWMyr4oqs3CnnNmzybC8yW72QCKmBx8dZhc3bFDbVtRj7LChhHZJG2FeIgxp7a_zkO-kjq8=w544-h544-l90-rj"
      },
      {
        id: "VLPLvb70EyvgMDIQ2Bic_Ua8rtFSQ0qDUwtV",
        type: "playlist",
        title: "Bollywood Recharger",
        subtitle: "Badshah, Shashwat Sachdev, Tanishk Bagchi",
        thumbnail: "https://yt3.googleusercontent.com/OOwHZMua9aN8yJETwPxch5b1MY9LeqExnEqHU5j-oLjqs6UyOequf20mliNvV3FMF44avbI3pCY=s1200"
      },
      {
        id: "VLRDCLAK5uy_kiDNaS5nAXxdzsqFElFKKKs0GUEFJE26w",
        type: "playlist",
        title: "90s Bollywood Dance",
        subtitle: "Alka Yagnik, Udit Narayan, Abhijeet, Sameer",
        thumbnail: "https://yt3.googleusercontent.com/1Ao6ijeePyojWqvvmMC_7pIr1sooCD3TXNnOV6-uqcqUeHMWhBf_ZDTc7lAazRu1G82OVaYgrM2MNvY=w544-h544-l90-rj"
      },
      {
        id: "VLRDCLAK5uy_n93B_MvN0E4U51c4r7YvN0Bw9E4y5t_wE",
        type: "playlist",
        title: "10s Bollywood Dance",
        subtitle: "Vishal-Shekhar, Neha Kakkar, Badshah, Pritam",
        thumbnail: "https://yt3.googleusercontent.com/iEL1KbTkccnbULNt84Ea_nv54m6_RGzIe2DMnSjb7gcoWq-6KN4FaEJucgL_C-Yy662pv1_vyenqqql1=w544-h544-l90-rj"
      }
    ]
  },
  {
    title: "New releases",
    items: [
      {
        id: "MPREb_r8icX4VMenY",
        type: "album",
        title: "Hit Songs Malayalam",
        subtitle: "Album • ARJN, KDS & M.H.R",
        thumbnail: "https://yt3.googleusercontent.com/2kgZfEBP3Cvrqla0TSscsFNe87uYEDzG0979_ePPQxRwlbcrXiOgSOFbl3H152PaPhfLpQLViIYU0rz0=w544-h544-l90-rj"
      },
      {
        id: "MPREb_BQolR0DzVzC",
        type: "album",
        title: "Barsaat X Spider-Man",
        subtitle: "Single • Banjaare & Roni",
        thumbnail: "https://yt3.googleusercontent.com/_3Xhg_Tpnh4MSm2Xtp1RzNdNKk0rfpZCfoyJtuBm6R5J4ql93Dn5jInzmUJKH03nmpEQ4ehSBd5l71ly=w544-h544-l90-rj"
      },
      {
        id: "MPREb_ebBjzcNYxh9",
        type: "album",
        title: "Boohe Baarian",
        subtitle: "Single • Aditya Rikhari, Rochak Kohli & Kumaar",
        thumbnail: "https://yt3.googleusercontent.com/pAMPl0nyVJCscYVrK7hIKxeOiiBNTlzDRW96M2Mg-kq2yoEBoZTuHZMmA7ViBS5MYVq-ggBcvDyZ7Ss=w544-h544-l90-rj"
      },
      {
        id: "MPREb_5w8dWm0CDvJ",
        type: "album",
        title: "Main Neevan Mera Murshad Ucha",
        subtitle: "Single • Nusrat Fateh Ali Khan",
        thumbnail: "https://yt3.googleusercontent.com/m0Yos0GmvpkBEMlFn8OobotdzPJi38H0bj_JRaiGtVuZ1QZZUDap9aHhsuGNouV0I28F8wR-QK5Cm2Gz=w544-h544-l90-rj"
      },
      {
        id: "MPREb_LRfu61MqLoU",
        type: "album",
        title: "petal",
        subtitle: "Album • Ariana Grande",
        thumbnail: "https://yt3.googleusercontent.com/6LDZTIjk3nbSSsG8J0M2_ME4KWzt4MTZ7oqrZlWg-uZ1gRWnBKt9ySPibZ5l7GJ_-j6gB6hv-qLNaPE=w544-h544-l90-rj"
      },
      {
        id: "MPREb_X2GiOAX5vef",
        type: "album",
        title: "Gehra Hua Afro Mix",
        subtitle: "Single • DJ SHVM, Arijit Singh, Armaan Khan",
        thumbnail: "https://yt3.googleusercontent.com/H6lZYHIsFNq4pSYN4_4ZSW5ZcFjjm2G_CfhLyWnZJhVj1QXJ4hY5R2Lf1k3w7zQ1n3CGZ_UKKcZrf08=w544-h544-l90-rj"
      }
    ]
  },
  {
    title: "Charts",
    items: [
      {
        id: "VLPL4fGSI1pDJn5RgLW0Sb_zECecWdH_4zOX",
        type: "playlist",
        title: "Top Weekly Videos Hindi",
        subtitle: "Chart • YouTube Music",
        thumbnail: "https://yt3.googleusercontent.com/t12e2jKIn8FQ4bop_MAA9GHYg4PqcgMniUGWPXEHBt5RthBBhmKiYdfYVB4CBs56RSWoD2iuMA=s1200"
      },
      {
        id: "VLRDCLAK5uy_kb7EBi6y3GrtJri4_ZH56Ms786DFEimbM",
        type: "playlist",
        title: "Top Weekly Videos Tamil",
        subtitle: "Chart • YouTube Music",
        thumbnail: "https://yt3.googleusercontent.com/9I45SYZAfTeR17ByV9i2yDpWhQ5DTWMCrW3Lei8vMIiZzeyUnf2zRFUDBob4TGwgUkXAAR_x1Xa8VA=w544-h544-l90-rj"
      },
      {
        id: "VLRDCLAK5uy_m3zM4iKwxP6tV7pQx9yF0Lh7uO4M4Y4",
        type: "playlist",
        title: "Top Weekly Videos Punjabi",
        subtitle: "Chart • YouTube Music",
        thumbnail: "https://yt3.googleusercontent.com/eQ-Zt_pP-w_tZq3v0RorQYjT7Y9s7Zf7vj7YfW0t6rYd4_h1uPZc6_w9tLp1wU9qY0F-eQ-Zt_pP-w=w544-h544-l90-rj"
      },
      {
        id: "VLPL4fGSI1pDJn4pTWyM3t61lOyZ6_4jcNOw",
        type: "playlist",
        title: "Trending 20 India",
        subtitle: "Chart • YouTube Music",
        thumbnail: "https://yt3.googleusercontent.com/xwzgAddinQgyUEZcRnTC5PLM3fj8CeP_jmsK8EBDojZmLU8HHyi2CFZYQfHhZvs3l4M-FkMF7qs=s1200"
      },
      {
        id: "VLRDCLAK5uy_kbcE6-nqy4c_wNfBqV3j-qF_lGv3qCj_M",
        type: "playlist",
        title: "Top Weekly Videos Telugu",
        subtitle: "Chart • YouTube Music",
        thumbnail: "https://yt3.googleusercontent.com/voQriSjwTDvhYfOsDX3TqTfNOVtVoZyY3TIlDjem4209T6nU839S6NoMERGoN7UisKAFSsViy4Qv6gRI=w544-h544-l90-rj"
      },
      {
        id: "VLRDCLAK5uy_mN3A6l0v7_4917Bw_q_sJ6P_yvG5xO_c8",
        type: "playlist",
        title: "Top Weekly Videos Bhojpuri",
        subtitle: "Chart • YouTube Music",
        thumbnail: "https://lh3.googleusercontent.com/tZq3v0RorQYjT7Y9s7Zf7vj7YfW0t6rYd4_h1uPZc6_w9tLp1wU9qY0F-eQ-Zt_pP-w=w120-h120-l90-rj"
      }
    ]
  }
];

const YoutubeMusicHome: React.FC = () => {
  const navigate = useNavigate();
  const [shelves, setShelves] = useState<YtShelf[]>(DEFAULT_SHELVES);
  const [chips, setChips] = useState<YtChip[]>([]);
  const [activeParams, setActiveParams] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { playTrack } = usePlayer();
  const { toggleOfflineTrack, syncStatus } = useOffline();
  const [cachedTracks, setCachedTracks] = useState<Set<string>>(new Set());

  const mapShelfItemToTrack = (item: YtShelfItem): Track => {
    const fakeTrackId = `yt-${item.id}`;
    return {
      id: fakeTrackId,
      playlistId: 'youtube-home',
      userId: 'youtube',
      name: item.title,
      artists: [{ id: '', name: item.subtitle.split(' • ')[0] || 'Unknown Artist' }],
      album: {
        id: '',
        name: 'YouTube Music Home',
        imageUrl: item.thumbnail,
      },
      durationMs: 0,
      explicit: false,
      spotifyUrl: `https://www.youtube.com/watch?v=${item.id}`,
      isOfflinePreferred: false,
      addedAt: new Date().toISOString(),
    };
  };

  const updateCachedStatus = async (ytShelves: YtShelf[]) => {
    const cached = new Set<string>();
    const tracksToCheck: Track[] = [];
    for (const shelf of ytShelves) {
      for (const item of shelf.items) {
        if (item.type === 'track') {
          tracksToCheck.push(mapShelfItemToTrack(item));
        }
      }
    }
    for (const track of tracksToCheck) {
      const isCached = await audioCacheManager.isTrackCached(track.id);
      if (isCached) {
        cached.add(track.id);
      }
    }
    setCachedTracks(cached);
  };

  const handleToggleOffline = async (e: React.MouseEvent, item: YtShelfItem) => {
    e.stopPropagation();
    const track = mapShelfItemToTrack(item);
    // Crucial: we also need to store the mapping so it plays directly when offline resolved
    localStorage.setItem(`youtube_${track.id}`, item.id);
    await toggleOfflineTrack(track);
    const isCached = await audioCacheManager.isTrackCached(track.id);
    setCachedTracks(prev => {
      const next = new Set(prev);
      if (isCached) {
        next.add(track.id);
      } else {
        next.delete(track.id);
      }
      return next;
    });
  };

  useEffect(() => {
    if (shelves.length > 0) {
      updateCachedStatus(shelves);
    }
  }, [shelves]);

  useEffect(() => {
    fetchFeed();
  }, []);

  const fetchFeed = async (paramsVal?: string | null) => {
    try {
      setLoading(true);
      const url = paramsVal ? `/youtube-music/home?params=${encodeURIComponent(paramsVal)}` : '/youtube-music/home';
      const res = await api.get<{ shelves: YtShelf[], chips: YtChip[] }>(url);
      
      if (paramsVal) {
        setShelves(res.data.shelves);
      } else {
        setShelves(DEFAULT_SHELVES);
      }

      if (res.data.chips && res.data.chips.length > 0) {
        setChips(res.data.chips);
      }
      setError(null);
    } catch (err: any) {
      console.error(err);
      if (!paramsVal) {
        setShelves(DEFAULT_SHELVES);
      } else {
        setError(err.response?.data?.error || 'Failed to load YouTube Music home feed. Make sure you logged in with Google and granted YouTube access.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePlay = async (item: YtShelfItem) => {
    if (item.type !== 'track') {
      // For albums and playlists, we could support loading them as a queue in the future
      return;
    }

    // Set YouTube ID mapping in localStorage so playback works immediately without scraped searching
    const fakeTrackId = `yt-${item.id}`;
    localStorage.setItem(`youtube_${fakeTrackId}`, item.id);

    const track: Track = {
      id: fakeTrackId,
      playlistId: 'youtube-home',
      userId: 'youtube',
      name: item.title,
      artists: [{ id: '', name: item.subtitle.split(' • ')[0] || 'Unknown Artist' }],
      album: {
        id: '',
        name: 'YouTube Music Home',
        imageUrl: item.thumbnail,
      },
      durationMs: 0,
      explicit: false,
      spotifyUrl: `https://www.youtube.com/watch?v=${item.id}`,
      isOfflinePreferred: false,
      addedAt: new Date().toISOString(),
    };

    await playTrack(track);
  };

  const handlePlayAllShelf = async (items: YtShelfItem[]) => {
    const tracks = items.filter(i => i.type === 'track').map(mapShelfItemToTrack);
    if (tracks.length > 0) {
      for (const item of items) {
        if (item.type === 'track') {
          const fakeTrackId = `yt-${item.id}`;
          localStorage.setItem(`youtube_${fakeTrackId}`, item.id);
        }
      }
      await playTrack(tracks[0], tracks);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[50vh] text-white">
        <div className="w-12 h-12 border-4 border-red-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-white/60 tracking-wider">Retrieving your YouTube Music feed...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-white">
        <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 border border-red-500/20 mb-4 animate-bounce">
          <FiMusic size={24} />
        </div>
        <h3 className="text-xl font-bold mb-2">Could Not Load Home Feed</h3>
        <p className="text-white/60 max-w-md mb-6">{error}</p>
        <button
          onClick={() => fetchFeed(activeParams)}
          className="px-6 py-2.5 rounded-full bg-red-600 text-white font-semibold hover:bg-red-700 transition-colors shadow-lg"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-8 py-4 md:py-6 space-y-8 md:space-y-10 text-white bg-[#121212] pb-28 min-h-screen w-full">
      
      {/* Tag Chips Category Filter Bar - Direct Top Placement */}
      {chips.length > 0 && (
        <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-none">
          <button
            onClick={() => {
              setActiveParams(null);
              fetchFeed(null);
            }}
            className={`px-4 py-1.5 rounded-lg border active:scale-95 transition text-sm font-semibold whitespace-nowrap ${
              activeParams === null
                ? 'bg-white border-white text-black'
                : 'bg-white/10 border-white/5 hover:bg-white/20 text-white'
            }`}
          >
            All
          </button>
          {chips.map((chip) => {
            const isSelected = activeParams === chip.params;
            return (
              <button
                key={chip.text}
                onClick={() => {
                  setActiveParams(chip.params);
                  fetchFeed(chip.params);
                }}
                className={`px-4 py-1.5 rounded-lg border active:scale-95 transition text-sm font-semibold whitespace-nowrap ${
                  isSelected
                    ? 'bg-white border-white text-black'
                    : 'bg-white/10 border-white/5 hover:bg-white/20 text-white'
                }`}
              >
                {chip.text}
              </button>
            );
          })}
        </div>
      )}

      {shelves.map((shelf, shelfIdx) => {
        const isTrackShelf = shelf.items.length > 0 && shelf.items[0].type === 'track';
        const containerId = `shelf-container-${shelfIdx}`;

        return (
          <div key={shelfIdx} className="space-y-6">
            
            {/* Shelf Header with Controls */}
            <div className="flex items-center justify-between">
              <div className="flex items-end gap-4">
                <div className="space-y-1">
                  {shelf.strapline && (
                    <p className="text-xs font-bold tracking-wider text-white/50 uppercase">
                      {shelf.strapline}
                    </p>
                  )}
                  <h3 className="text-3xl font-extrabold tracking-tight text-white">{shelf.title}</h3>
                </div>
                {isTrackShelf && (
                  <button
                    onClick={() => handlePlayAllShelf(shelf.items)}
                    className="ml-2 px-4 py-1.5 rounded-full border border-white/20 hover:bg-white/10 text-xs font-bold tracking-wider uppercase transition-colors"
                  >
                    Play all
                  </button>
                )}
              </div>

              {/* Prev / Next Circular Navigation Buttons */}
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => {
                    const el = document.getElementById(containerId);
                    if (el) el.scrollBy({ left: -500, behavior: 'smooth' });
                  }}
                  className="w-9 h-9 rounded-full border border-white/10 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white transition-colors cursor-pointer"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 0 24 24" width="20" fill="currentColor">
                    <path d="M13.793 5.293 7.086 12l6.707 6.707a1 1 0 101.414-1.414L9.914 12l5.293-5.293a1 1 0 10-1.414-1.414Z"></path>
                  </svg>
                </button>
                <button 
                  onClick={() => {
                    const el = document.getElementById(containerId);
                    if (el) el.scrollBy({ left: 500, behavior: 'smooth' });
                  }}
                  className="w-9 h-9 rounded-full border border-white/10 hover:bg-white/10 flex items-center justify-center text-white transition-colors cursor-pointer"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 0 24 24" width="20" fill="currentColor">
                    <path d="M8.793 5.293a1 1 0 000 1.414L14.086 12l-5.293 5.293a1 1 0 101.414 1.414L16.914 12l-6.707-6.707a1 1 0 00-1.414 0Z"></path>
                  </svg>
                </button>
              </div>
            </div>
            
            {isTrackShelf ? (
              /* Quick Picks grid style: 4 rows, scroll horizontally */
              <div className="relative">
                <div id={containerId} className="grid grid-rows-4 grid-flow-col gap-x-12 gap-y-4 overflow-x-auto pb-4 scroll-smooth scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                  {shelf.items.map((item) => {
                    const fakeTrackId = `yt-${item.id}`;
                    const isCached = cachedTracks.has(fakeTrackId);
                    const status = syncStatus.get(fakeTrackId);

                    return (
                      <div
                        key={item.id}
                        onClick={() => handlePlay(item)}
                        className="flex items-center gap-4 p-1 rounded-xl hover:bg-white/5 transition-all duration-200 cursor-pointer w-[320px] md:w-[380px] flex-shrink-0 group relative"
                      >
                        {/* Thumbnail Image Container */}
                        <div className="relative w-12 h-12 rounded bg-white/5 flex-shrink-0 shadow-md overflow-hidden">
                          {item.thumbnail ? (
                            <img
                              src={item.thumbnail}
                              alt={item.title}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-white/20">
                              <FiMusic size={18} />
                            </div>
                          )}
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                            <FiPlay fill="white" className="text-white ml-0.5" size={14} />
                          </div>
                        </div>

                        {/* Title and Subtitle */}
                        <div className="min-w-0 flex-1">
                          <h4 className="font-semibold text-sm text-white truncate group-hover:text-red-400 transition-colors" title={item.title}>
                            {item.title}
                          </h4>
                          <p className="text-xs text-white/50 truncate mt-0.5" title={item.subtitle}>
                            {item.subtitle || 'YouTube Music'}
                          </p>
                        </div>

                        {/* Offline Action Button */}
                        <button
                          onClick={(e) => handleToggleOffline(e, item)}
                          className="p-2 rounded-full opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-white/10 transition-all duration-200 text-white/60 hover:text-white"
                          disabled={status?.status === 'downloading'}
                          title={isCached ? 'Remove from offline' : 'Download for offline'}
                        >
                          {status?.status === 'downloading' ? (
                            <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-red-500"></div>
                          ) : isCached ? (
                            <FiCheck className="text-green-500" size={14} />
                          ) : (
                            <FiDownload size={14} />
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* Carousel style for Albums/Playlists */
              <div className="relative group/carousel">
                <div id={containerId} className="flex gap-5 overflow-x-auto pb-4 scroll-smooth scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                  {shelf.items.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => navigate(`/youtube-playlist/${item.id}?title=${encodeURIComponent(item.title)}`)}
                      className="flex-shrink-0 w-44 space-y-3 group cursor-pointer"
                    >
                      <div className="relative aspect-square rounded-lg overflow-hidden bg-white/5 shadow-md">
                        {item.thumbnail ? (
                          <img
                            src={item.thumbnail}
                            alt={item.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-white/20">
                            <FiMusic size={40} />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-semibold text-sm truncate text-white leading-tight group-hover:underline" title={item.title}>
                          {item.title}
                        </h4>
                        <p className="text-xs text-white/40 truncate mt-1.5" title={item.subtitle}>
                          {item.subtitle || 'YouTube Music'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default YoutubeMusicHome;
