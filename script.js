 class MusicBud {
      constructor() {
          this.accessToken = null;
          this.clientId = null;
          this.currentTracks = [];
          this.allTracks = [];
          this.currentSource = 'liked';
          this.init();
      }

      init() {
          // DOM elements
          this.connectBtn = document.getElementById('connect-btn');
          this.clientIdInput = document.getElementById('client-id');
          this.authStatus = document.getElementById('auth-status');
          this.searchInput = document.getElementById('search-input');
          this.searchBtn = document.getElementById('search-btn');

          // Source buttons
          this.likedSongsBtn = document.getElementById('liked-songs-btn');
          this.playlistsBtn = document.getElementById('playlists-btn');
          this.albumsBtn = document.getElementById('albums-btn');

          // Selectors
          this.playlistSelect = document.getElementById('playlist-select');
          this.albumSelect = document.getElementById('album-select');
          this.playlistSelector = document.querySelector('.playlist-selector');
          this.albumSelector = document.querySelector('.album-selector');

          // Sort controls
          this.sortSelect = document.getElementById('sort-select');
          this.sortOrderBtn = document.getElementById('sort-order-btn');

          // Sections
          this.authSection = document.querySelector('.auth-section');
          this.librarySection = document.querySelector('.library-section');
          this.errorSection = document.querySelector('.error-section');

          // Track display
          this.trackGrid = document.getElementById('track-grid');
          this.loading = document.getElementById('loading');

          // Modal
          this.modal = document.getElementById('track-modal');
          this.closeBtn = document.querySelector('.close-btn');

          // Event listeners
          this.connectBtn.addEventListener('click', () => this.authenticate());
          this.searchBtn.addEventListener('click', () => this.filterTracks());
          this.searchInput.addEventListener('input', () => this.filterTracks());

          this.likedSongsBtn.addEventListener('click', () => this.switchSource('liked'));
          this.playlistsBtn.addEventListener('click', () => this.switchSource('playlists'));
          this.albumsBtn.addEventListener('click', () => this.switchSource('albums'));

          this.playlistSelect.addEventListener('change', () => this.loadPlaylist());
          this.albumSelect.addEventListener('change', () => this.loadAlbum());

          this.sortSelect.addEventListener('change', () => this.sortTracks());
          this.sortOrderBtn.addEventListener('click', () => this.toggleSortOrder());

          this.closeBtn.addEventListener('click', () => this.closeModal());
          this.modal.addEventListener('click', (e) => {
              if (e.target === this.modal) this.closeModal();
          });

          // Load saved credentials and check for auth
          this.loadCredentials();
          this.checkForAuthCallback();
      }

      loadCredentials() {
          const savedClientId = localStorage.getItem('spotify_client_id');
          if (savedClientId) this.clientIdInput.value = savedClientId;
      }

      // Generate PKCE challenge
      generateCodeVerifier() {
          const array = new Uint8Array(32);
          crypto.getRandomValues(array);
          return btoa(String.fromCharCode.apply(null, array))
              .replace(/\+/g, '-')
              .replace(/\//g, '_')
              .replace(/=/g, '');
      }

      async generateCodeChallenge(verifier) {
          const encoder = new TextEncoder();
          const data = encoder.encode(verifier);
          const digest = await crypto.subtle.digest('SHA-256', data);
          return btoa(String.fromCharCode.apply(null, new Uint8Array(digest)))
              .replace(/\+/g, '-')
              .replace(/\//g, '_')
              .replace(/=/g, '');
      }

      checkForAuthCallback() {
          const urlParams = new URLSearchParams(window.location.search);
          const code = urlParams.get('code');
          const error = urlParams.get('error');

          if (error) {
              this.showStatus('Authorization cancelled: ' + error, 'error');
              return;
          }

          if (code) {
              this.exchangeCodeForToken(code);
              // Clean up URL
              window.history.replaceState({}, document.title, window.location.pathname);
          }
      }

      async authenticate() {
          this.clientId = this.clientIdInput.value.trim();

          if (!this.clientId) {
              this.showError('Please enter your Spotify Client ID');
              return;
          }

          localStorage.setItem('spotify_client_id', this.clientId);

          try {
              // Generate PKCE parameters
              const codeVerifier = this.generateCodeVerifier();
              const codeChallenge = await this.generateCodeChallenge(codeVerifier);

              // Store code verifier for later use
              localStorage.setItem('code_verifier', codeVerifier);

              const redirectUri = window.location.origin + window.location.pathname;
              const scopes = [
                  'user-library-read',
                  'playlist-read-private',
                  'playlist-read-collaborative',
                  'user-read-private'
              ].join(' ');

              const authUrl = `https://accounts.spotify.com/authorize?` +
                  `client_id=${this.clientId}&` +
                  `response_type=code&` +
                  `redirect_uri=${encodeURIComponent(redirectUri)}&` +
                  `scope=${encodeURIComponent(scopes)}&` +
                  `code_challenge_method=S256&` +
                  `code_challenge=${codeChallenge}`;

              window.location.href = authUrl;
          } catch (error) {
              this.showError('Authentication setup failed: ' + error.message);
          }
      }

      async exchangeCodeForToken(code) {
          try {
              this.showStatus('Getting access token...', 'loading');

              const codeVerifier = localStorage.getItem('code_verifier');
              const redirectUri = window.location.origin + window.location.pathname;

              if (!codeVerifier) {
                  throw new Error('Code verifier not found');
              }

              const response = await fetch('https://accounts.spotify.com/api/token', {
                  method: 'POST',
                  headers: {
                      'Content-Type': 'application/x-www-form-urlencoded',
                  },
                  body: new URLSearchParams({
                      grant_type: 'authorization_code',
                      code: code,
                      redirect_uri: redirectUri,
                      client_id: this.clientId,
                      code_verifier: codeVerifier
                  })
              });

              if (!response.ok) {
                  const errorData = await response.text();
                  throw new Error(`Token exchange failed: ${response.status} - ${errorData}`);
              }

              const data = await response.json();
              this.accessToken = data.access_token;

              // Clean up stored verifier
              localStorage.removeItem('code_verifier');

              this.showStatus('Connected successfully!', 'success');
              this.showLibraryInterface();
              this.loadLikedSongs();

          } catch (error) {
              this.showStatus('Authentication failed: ' + error.message, 'error');
              console.error('Token exchange error:', error);
          }
      }

      showLibraryInterface() {
          this.authSection.style.display = 'none';
          this.librarySection.style.display = 'block';
      }

      switchSource(source) {
          // Update active button
          document.querySelectorAll('.source-btn').forEach(btn => btn.classList.remove('active'));

          if (source === 'liked') {
              this.likedSongsBtn.classList.add('active');
              this.playlistSelector.style.display = 'none';
              this.albumSelector.style.display = 'none';
              this.loadLikedSongs();
          } else if (source === 'playlists') {
              this.playlistsBtn.classList.add('active');
              this.playlistSelector.style.display = 'block';
              this.albumSelector.style.display = 'none';
              this.loadPlaylists();
          } else if (source === 'albums') {
              this.albumsBtn.classList.add('active');
              this.playlistSelector.style.display = 'none';
              this.albumSelector.style.display = 'block';
              this.loadAlbums();
          }

          this.currentSource = source;
      }

      async loadLikedSongs() {
          try {
              this.showLoading(true);
              const tracks = [];
              let url = 'https://api.spotify.com/v1/me/tracks?limit=50';

              while (url) {
                  const response = await fetch(url, {
                      headers: { 'Authorization': 'Bearer ' + this.accessToken }
                  });

                  if (!response.ok) {
                      throw new Error('Failed to fetch liked songs');
                  }

                  const data = await response.json();
                  tracks.push(...data.items.map(item => item.track));
                  url = data.next;
              }

              await this.processTracksWithFeatures(tracks);
              this.showLoading(false);

          } catch (error) {
              this.showError('Failed to load liked songs: ' + error.message);
              this.showLoading(false);
          }
      }

      async loadPlaylists() {
          try {
              const response = await fetch('https://api.spotify.com/v1/me/playlists?limit=50', {
                  headers: { 'Authorization': 'Bearer ' + this.accessToken }
              });

              if (!response.ok) {
                  throw new Error('Failed to fetch playlists');
              }

              const data = await response.json();
              this.populatePlaylistSelect(data.items);

          } catch (error) {
              this.showError('Failed to load playlists: ' + error.message);
          }
      }

      async loadAlbums() {
          try {
              const response = await fetch('https://api.spotify.com/v1/me/albums?limit=50', {
                  headers: { 'Authorization': 'Bearer ' + this.accessToken }
              });

              if (!response.ok) {
                  throw new Error('Failed to fetch albums');
              }

              const data = await response.json();
              this.populateAlbumSelect(data.items);

          } catch (error) {
              this.showError('Failed to load albums: ' + error.message);
          }
      }

      populatePlaylistSelect(playlists) {
          this.playlistSelect.innerHTML = '<option value="">Select a playlist...</option>';
          playlists.forEach(playlist => {
              const option = document.createElement('option');
              option.value = playlist.id;
              option.textContent = playlist.name;
              this.playlistSelect.appendChild(option);
          });
      }

      populateAlbumSelect(albums) {
          this.albumSelect.innerHTML = '<option value="">Select an album...</option>';
          albums.forEach(albumItem => {
              const album = albumItem.album;
              const option = document.createElement('option');
              option.value = album.id;
              option.textContent = `${album.name} - ${album.artists[0].name}`;
              this.albumSelect.appendChild(option);
          });
      }

      async loadPlaylist() {
          const playlistId = this.playlistSelect.value;
          if (!playlistId) return;

          try {
              this.showLoading(true);
              const tracks = [];
              let url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=50`;

              while (url) {
                  const response = await fetch(url, {
                      headers: { 'Authorization': 'Bearer ' + this.accessToken }
                  });

                  if (!response.ok) {
                      throw new Error('Failed to fetch playlist tracks');
                  }

                  const data = await response.json();
                  tracks.push(...data.items.map(item => item.track).filter(track => track &&
  track.id));
                  url = data.next;
              }

              await this.processTracksWithFeatures(tracks);
              this.showLoading(false);

          } catch (error) {
              this.showError('Failed to load playlist: ' + error.message);
              this.showLoading(false);
          }
      }

      async loadAlbum() {
          const albumId = this.albumSelect.value;
          if (!albumId) return;

          try {
              this.showLoading(true);

              const response = await
  fetch(`https://api.spotify.com/v1/albums/${albumId}/tracks?limit=50`, {
                  headers: { 'Authorization': 'Bearer ' + this.accessToken }
              });

              if (!response.ok) {
                  throw new Error('Failed to fetch album tracks');
              }

              const data = await response.json();
              await this.processTracksWithFeatures(data.items);
              this.showLoading(false);

          } catch (error) {
              this.showError('Failed to load album: ' + error.message);
              this.showLoading(false);
          }
      }

      async processTracksWithFeatures(tracks) {
          const trackIds = tracks.map(track => track.id).filter(id => id);

          if (trackIds.length === 0) {
              this.allTracks = [];
              this.currentTracks = [];
              this.displayTracks();
              return;
          }

          // Get audio features in batches of 100
          const audioFeatures = [];
          for (let i = 0; i < trackIds.length; i += 100) {
              const batch = trackIds.slice(i, i + 100);
              const response = await
  fetch(`https://api.spotify.com/v1/audio-features?ids=${batch.join(',')}`, {
                  headers: { 'Authorization': 'Bearer ' + this.accessToken }
              });

              if (response.ok) {
                  const data = await response.json();
                  audioFeatures.push(...data.audio_features);
              }
          }

          // Combine track info with audio features
          this.allTracks = tracks.map((track, index) => ({
              ...track,
              audioFeatures: audioFeatures[index] || {}
          })).filter(track => track.audioFeatures);

          this.currentTracks = [...this.allTracks];
          this.displayTracks();
      }

      displayTracks() {
          this.trackGrid.innerHTML = '';

          this.currentTracks.forEach(track => {
              const trackCard = this.createTrackCard(track);
              this.trackGrid.appendChild(trackCard);
          });
      }

      createTrackCard(track) {
          const card = document.createElement('div');
          card.className = 'track-card';
          card.onclick = () => this.showTrackModal(track);

          const image = track.album?.images?.[2]?.url || track.images?.[2]?.url || '';
          const artistNames = track.artists?.map(a => a.name).join(', ') || 'Unknown Artist';
          const albumName = track.album?.name || 'Unknown Album';
          const tempo = track.audioFeatures?.tempo ? Math.round(track.audioFeatures.tempo) + ' BPM' :
   'N/A';
          const key = this.getKeyName(track.audioFeatures?.key, track.audioFeatures?.mode);

          card.innerHTML = `
              <img src="${image}" alt="Album cover" onerror="this.style.display='none'">
              <div class="track-card-info">
                  <h4>${track.name}</h4>
                  <p>${artistNames}</p>
                  <p>${albumName}</p>
              </div>
              <div class="track-quick-info">
                  <div>${tempo}</div>
                  <div>${key}</div>
              </div>
          `;

          return card;
      }

      showTrackModal(track) {
          const features = track.audioFeatures || {};

          // Populate modal with track info
          document.getElementById('modal-track-image').src = track.album?.images?.[1]?.url ||
  track.images?.[1]?.url || '';
          document.getElementById('modal-track-name').textContent = track.name;
          document.getElementById('modal-track-artist').textContent = track.artists?.map(a =>
  a.name).join(', ') || 'Unknown Artist';
          document.getElementById('modal-track-album').textContent = track.album?.name || 'Unknown
  Album';

          // Populate audio features
          document.getElementById('modal-tempo').textContent = features.tempo ?
  Math.round(features.tempo) + ' BPM' : 'N/A';
          document.getElementById('modal-key').textContent = this.getKeyName(features.key,
  features.mode);
          document.getElementById('modal-time-signature').textContent = features.time_signature ?
  features.time_signature + '/4' : 'N/A';
          document.getElementById('modal-release-date').textContent = track.album?.release_date ||
  'Unknown';
          document.getElementById('modal-duration').textContent =
  this.formatDuration(track.duration_ms);

          document.getElementById('modal-energy').textContent = features.energy ?
  Math.round(features.energy * 100) + '%' : 'N/A';
          document.getElementById('modal-danceability').textContent = features.danceability ?
  Math.round(features.danceability * 100) + '%' : 'N/A';
          document.getElementById('modal-valence').textContent = features.valence ?
  Math.round(features.valence * 100) + '%' : 'N/A';
          document.getElementById('modal-acousticness').textContent = features.acousticness ?
  Math.round(features.acousticness * 100) + '%' : 'N/A';
          document.getElementById('modal-instrumentalness').textContent = features.instrumentalness ?
   Math.round(features.instrumentalness * 100) + '%' : 'N/A';
          document.getElementById('modal-liveness').textContent = features.liveness ?
  Math.round(features.liveness * 100) + '%' : 'N/A';
          document.getElementById('modal-speechiness').textContent = features.speechiness ?
  Math.round(features.speechiness * 100) + '%' : 'N/A';

          this.modal.style.display = 'flex';
      }

      closeModal() {
          this.modal.style.display = 'none';
      }

      filterTracks() {
          const searchTerm = this.searchInput.value.toLowerCase().trim();

          if (!searchTerm) {
              this.currentTracks = [...this.allTracks];
          } else {
              this.currentTracks = this.allTracks.filter(track =>
                  track.name.toLowerCase().includes(searchTerm) ||
                  track.artists?.some(artist => artist.name.toLowerCase().includes(searchTerm)) ||
                  track.album?.name.toLowerCase().includes(searchTerm)
              );
          }

          this.sortTracks();
          this.displayTracks();
      }

      sortTracks() {
          const sortBy = this.sortSelect.value;
          const ascending = this.sortOrderBtn.dataset.order === 'asc';

          this.currentTracks.sort((a, b) => {
              let aValue, bValue;

              switch (sortBy) {
                  case 'name':
                      aValue = a.name.toLowerCase();
                      bValue = b.name.toLowerCase();
                      break;
                  case 'artist':
                      aValue = a.artists?.[0]?.name.toLowerCase() || '';
                      bValue = b.artists?.[0]?.name.toLowerCase() || '';
                      break;
                  case 'album':
                      aValue = a.album?.name.toLowerCase() || '';
                      bValue = b.album?.name.toLowerCase() || '';
                      break;
                  case 'release_date':
                      aValue = a.album?.release_date || '';
                      bValue = b.album?.release_date || '';
                      break;
                  case 'tempo':
                      aValue = a.audioFeatures?.tempo || 0;
                      bValue = b.audioFeatures?.tempo || 0;
                      break;
                  case 'energy':
                      aValue = a.audioFeatures?.energy || 0;
                      bValue = b.audioFeatures?.energy || 0;
                      break;
                  case 'danceability':
                      aValue = a.audioFeatures?.danceability || 0;
                      bValue = b.audioFeatures?.danceability || 0;
                      break;
                  default:
                      return 0;
              }

              if (aValue < bValue) return ascending ? -1 : 1;
              if (aValue > bValue) return ascending ? 1 : -1;
              return 0;
          });

          this.displayTracks();
      }

      toggleSortOrder() {
          const currentOrder = this.sortOrderBtn.dataset.order;
          const newOrder = currentOrder === 'asc' ? 'desc' : 'asc';
          this.sortOrderBtn.dataset.order = newOrder;
          this.sortOrderBtn.textContent = newOrder === 'asc' ? '↑' : '↓';
          this.sortTracks();
      }

      getKeyName(key, mode) {
          if (key === undefined || key === null) return 'Unknown';
          const keys = ['C', 'C♯/D♭', 'D', 'D♯/E♭', 'E', 'F', 'F♯/G♭', 'G', 'G♯/A♭', 'A', 'A♯/B♭',
  'B'];
          const keyName = keys[key] || 'Unknown';
          const modeName = mode === 1 ? 'Major' : 'Minor';
          return `${keyName} ${modeName}`;
      }

      formatDuration(ms) {
          if (!ms) return 'Unknown';
          const minutes = Math.floor(ms / 60000);
          const seconds = Math.floor((ms % 60000) / 1000);
          return `${minutes}:${seconds.toString().padStart(2, '0')}`;
      }

      showLoading(show) {
          this.loading.style.display = show ? 'block' : 'none';
      }

      showError(message) {
          document.getElementById('error-message').textContent = message;
          this.errorSection.style.display = 'block';
          setTimeout(() => {
              this.errorSection.style.display = 'none';
          }, 5000);
      }

      showStatus(message, type) {
          this.authStatus.textContent = message;
          this.authStatus.className = `status ${type}`;
      }
  }

  // Initialize the app when DOM is loaded
  document.addEventListener('DOMContentLoaded', () => {
      new MusicBud();
  });
