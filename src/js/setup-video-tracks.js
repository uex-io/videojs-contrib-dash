import dashjs from 'dashjs';
import videojs from 'video.js';

/**
 * Setup video tracks. Take the tracks from dash and add the tracks to videojs. Listen for when
 * videojs changes tracks and apply that to the dash player because videojs doesn't do this
 * natively.
 *
 * @private
 * @param {videojs} player the videojs player instance
 * @param {videojs.tech} tech the videojs tech being used
 */
function handlePlaybackMetadataLoadedForVideo(player, tech) {
  const mediaPlayer = player.dash.mediaPlayer;

  const dashVideoTracks = mediaPlayer.getTracksFor('video');
  const videojsVideoTracks = player.videoTracks();

  function generateIdFromTrackIndex(index) {
    return `dash-video-${index}`;
  }

// used following source for working out relationship between dashjs and videojs
// https://html.spec.whatwg.org/multipage/media.html#dom-videotrack-kind

  function generateKindFromTrack(track) {
    // our options are; alternative, main, captions, sign, subtitles, commentary, and empty (default)

    if (track.roles) {
      // main combinations
      if (track.roles.some(role => role === "main")) {
        if (track.roles.some(role => role === "caption")) {
          return "captions";
        } else if (track.roles.some(role => role === "subtitle")) {
          return "subtitle";
        } else {
          return "main";
        } 
      }
    
      if (track.roles.some(role => role === "commentary")) {
        return "commentary";
      }

      if (track.roles.some(role => role === "alternate")) {
        return "alternate";
      }
      // Not sure if this is a dash role, but for completion until we know better.
      if (track.roles.some(role => role === "sign")) {
        return "sign";
      }
    }
    // default if no roles or no explicit kind is empty string (see https://html.spec.whatwg.org/multipage/media.html#dom-videotrack-kind)
    // this was returning 'main' for audio, so if it causes problems, we do that too, but for now follow spec.
    return "";
  }

  function findDashVideoTrack(subDashVideoTracks, videojsVideoTrack) {
    return subDashVideoTracks.find(({index}) =>
      generateIdFromTrackIndex(index) === videojsVideoTrack.id
    );
  }

  // is this relevant for video?ndjb
  // Safari creates a single native `AudioTrack` (not `videojs.AudioTrack`) when loading. Clear all
  // automatically generated audio tracks so we can create them all ourself.
  if (videojsVideoTracks.length) {
    tech.clearTracks(['video']);
  }

  const currentVideoTrack = mediaPlayer.getCurrentTrackFor('video');

  dashVideoTracks.forEach((dashTrack) => {
    let localizedLabel;

    if (Array.isArray(dashTrack.labels)) {
      for (let i = 0; i < dashTrack.labels.length; i++) {
        if (
          dashTrack.labels[i].lang &&
          player.language().indexOf(dashTrack.labels[i].lang.toLowerCase()) !== -1
        ) {
          localizedLabel = dashTrack.labels[i];

          break;
        }
      }
    }

    let label;

    if (localizedLabel) {
      label = localizedLabel.text;
    } else if (Array.isArray(dashTrack.labels) && dashTrack.labels.length === 1) {
      label = dashTrack.labels[0].text;
    } else {
      label = dashTrack.lang;

      if (dashTrack.roles && dashTrack.roles.length) {
        label += ' (' + dashTrack.roles.join(', ') + ')';
      }
    }

    // Add the track to the player's video track list.
    videojsVideoTracks.addTrack(
      new videojs.VideoTrack({
        selected: dashTrack === currentVideoTrack,
        id: generateIdFromTrackIndex(dashTrack.index),
        kind: generateKindFromTrack(dashTrack),
        label,
        language: dashTrack.lang
      })
    );
  });

  const videoTracksChangeHandler = () => {
    for (let i = 0; i < videojsVideoTracks.length; i++) {
      const track = videojsVideoTracks[i];

      if (track.selected) {
        // Find the video track we just selected by the id
        const dashVideoTrack = findDashVideoTrack(dashVideoTracks, track);

        // Set is as the current track
        mediaPlayer.setCurrentTrack(dashVideoTrack);

        // Stop looping
        continue;
      }
    }
  };

  videojsVideoTracks.addEventListener('change', videoTracksChangeHandler);
  player.dash.mediaPlayer.on(dashjs.MediaPlayer.events.STREAM_TEARDOWN_COMPLETE, () => {
    videojsVideoTracks.removeEventListener('change', videoTracksChangeHandler);
  });
}

/*
 * Call `handlePlaybackMetadataLoaded` when `mediaPlayer` emits
 * `dashjs.MediaPlayer.events.PLAYBACK_METADATA_LOADED`.
 */
export default function setupVideoTracks(player, tech) {
  // When `dashjs` finishes loading metadata, create video tracks for `video.js`.
  player.dash.mediaPlayer.on(
    dashjs.MediaPlayer.events.PLAYBACK_METADATA_LOADED,
    handlePlaybackMetadataLoadedForVideo.bind(null, player, tech)
  );
}
