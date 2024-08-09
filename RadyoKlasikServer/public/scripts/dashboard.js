let intervalId;
let selectedArtwork = null;
let isExpanded = false;
let token = null;
// .env

function getToken() {
  return fetch("/auth/generate_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ shared_secret: SHARED_SECRET_KEY }),
  })
    .then((response) => response.json())
    .then((data) => {
      if (data.access_token) {
        return data.access_token;
      } else {
        alert("Failed to retrieve token");
        return null;
      }
    })
    .catch((error) => {
      console.error("Error fetching token:", error);
      return null;
    });
}

async function fetchWithAuth(url, options = {}) {
  if (!token) {
    token = await getToken();
    if (token) {
      localStorage.setItem("token", token);
    } else {
      return new Response(null, { status: 401 });
    }
  }

  options.headers = {
    ...options.headers,
    Authorization: `Bearer ${token}`,
  };

  let response = await fetch(url, options);

  if (response.status === 401) {
    const data = await response.json();
    if (data.message === "Token expired" || data.error === "token_expired") {
      console.log("Token expired, refreshing...");
      token = await getToken();
      if (token) {
        localStorage.setItem("token", token);
        options.headers.Authorization = `Bearer ${token}`;
        response = await fetch(url, options);
      } else {
        console.log("Failed to refresh token");
      }
    } else {
      console.log("Unauthorized");
    }
  }

  return response;
}

function startRecording() {
  const body = selectedArtwork ? `selected_artwork=${selectedArtwork}` : "";

  fetchWithAuth("recording/start", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body,
  }).then((response) => {
    if (response.ok) {
      intervalId = setInterval(updateRecordingTime, 1000);
    }
  });
}

function stopRecording() {
  fetchWithAuth("recording/stop", { method: "POST" }).then((response) => {
    if (response.ok) {
      clearInterval(intervalId);
      document.getElementById("recording-time").innerText = "Stopped.";
      document.getElementById("recording-time").style.fontSize = "16px";
      document.getElementById("rec-stat").style.backgroundColor = "#3c3c3c";
      fetchRecordings();
    }
  });
}

function updateRecordingTime() {
  fetchWithAuth("recording/status")
    .then((response) => response.json())
    .then((data) => {
      if (data.is_recording) {
        if (intervalId == null) {
          intervalId = setInterval(updateRecordingTime, 1000);
        }
        const elapsedTime = Math.floor(data.elapsed_time);
        const minutes = Math.floor(elapsedTime / 60);
        const seconds = elapsedTime % 60;
        document.getElementById(
          "recording-time"
        ).innerText = `${minutes}m ${seconds}s`;
        document.getElementById("recording-time").style.fontSize = "20px";
        document.getElementById("rec-stat").style.backgroundColor = "#EF5350";
      }
    });
}

function fetchArtworks() {
  fetchWithAuth("recording/get_artworks")
    .then((response) => response.json())
    .then((data) => {
      const container = document.getElementById("artworks-container");
      container.innerHTML = "";
      const artworksToShow = isExpanded ? data : data.slice(0, 4);
      artworksToShow.forEach((artwork) => {
        const img = document.createElement("img");
        img.src = `/static/assets/thumbnails/${artwork}`;
        img.classList.add("artwork");
        img.onclick = () => selectArtwork(img, artwork);
        container.appendChild(img);
      });
    });
}

function selectArtwork(img, artwork) {
  const artworks = document.querySelectorAll(".artwork");
  artworks.forEach((a) => a.classList.remove("selected"));
  img.classList.add("selected");
  selectedArtwork = artwork;
}

function fetchRecordings() {
  fetchWithAuth("recording/recordings")
    .then((response) => response.json())
    .then((data) => {
      const container = document.getElementById("recordings-container");
      container.innerHTML = "";
      data.recordings.sort((a, b) => new Date(b.date) - new Date(a.date));
      const recordingsToShow = isExpanded
        ? data.recordings
        : data.recordings.slice(0, 8);
      recordingsToShow.forEach((recording) => {
        const div = document.createElement("div");
        div.classList.add("recording");
        div.innerHTML = `
                <div id="artwork-container-${
                  recording.id
                }" class="artwork-container">
                  <img src="${recording.artwork}" alt="Artwork" />
                </div>
                <div><strong>Title:</strong> ${recording.title}</div>
                <div><strong>Artist:</strong> ${recording.artist}</div>
                <div><strong>Duration:</strong> ${Math.floor(
                  recording.duration / 60
                )}m ${recording.duration % 60}s</div>
                <div><a href="${
                  recording.stream
                }?token=${token}">Download</a></div>
                <form id="replacement-form-${
                  recording.id
                }" onsubmit="return false;">
            <input type="file" name="replacement" accept="audio/mp3" style="display: none;" onchange="autoSubmitReplacementForm('${
              recording.id
            }')" />
            <button type="button" onclick="triggerReplacementInput('${
              recording.id
            }')">Upload Replacement</button>
            <input type="hidden" name="recording_id" value="${recording.id}">
          </form>
                <button style="background-color: var(--theme-red); box-shadow: none" onclick="removeRecording('${
                  recording.id
                }')">Remove</button>
              `;
        container.appendChild(div);
      });
    });
}

function removeRecording(recordingId) {
  fetchWithAuth(`recording/remove/${recordingId}`, {
    method: "DELETE",
  }).then((response) => {
    if (response.ok) {
      fetchRecordings();
    }
  });
}

async function removeSelectedArtwork() {
  if (selectedArtwork) {
    try {
      const response = await fetchWithAuth(
        `recording/remove_artwork/${selectedArtwork}`,
        {
          method: "DELETE",
        }
      );
      if (response.ok) {
        fetchArtworks();
        selectedArtwork = null;
      } else {
        const data = await response.json();
        alert(
          data.error || "An error occurred while trying to remove the artwork."
        );
      }
    } catch (error) {
      alert("An error occurred while trying to remove the artwork.");
    }
  } else {
    alert("Please select an artwork to remove.");
  }
}

function triggerFileInput() {
  document.getElementById("file-upload-input").click();
}

function autoSubmitForm() {
  const form = document.getElementById("upload-artwork-form");
  form.submit();
}

function autoSubmitReplacementForm(recordingId) {
  const formReplace = document.getElementById(
    `replacement-form-${recordingId}`
  );
  const formData = new FormData(formReplace);

  const artworkContainer = document.getElementById(
    `artwork-container-${recordingId}`
  );
  artworkContainer.innerHTML = `
    <div class="circular-bar" id="circular-bar-${recordingId}">
      <div class="percent" id="percent-${recordingId}">0%</div>
    </div>
  `;

  const xhr = new XMLHttpRequest();

  xhr.open("POST", "recording/replace", true);
  xhr.setRequestHeader("Authorization", `Bearer ${token}`);

  xhr.upload.onprogress = function (event) {
    if (event.lengthComputable) {
      const percentComplete = Math.round((event.loaded / event.total) * 100);
      const progressPercentage = document.getElementById(
        `percent-${recordingId}`
      );
      progressPercentage.textContent = `${percentComplete}%`;

      const circularBar = document.getElementById(
        `circular-bar-${recordingId}`
      );
      circularBar.style.background = `conic-gradient(var(--theme-purple) ${
        percentComplete * 3.6
      }deg, #e8f0f7 0deg)`;
    }
  };

  xhr.onload = function () {
    if (xhr.status === 200) {
      console.log("Upload complete");
      fetchRecordings();
    } else {
      console.error("Upload failed");
    }
  };

  xhr.onerror = function () {
    console.error("Upload error");
  };

  xhr.send(formData);
}

function triggerReplacementInput(recordingId) {
  document
    .querySelector(`#replacement-form-${recordingId} input[type="file"]`)
    .click();
}

function toggleExpand() {
  isExpanded = !isExpanded;
  fetchArtworks();
  fetchRecordings();
  document.getElementById("expand-button").innerText = isExpanded
    ? "Collapse"
    : "Expand";
}

document.addEventListener("DOMContentLoaded", async function () {
  token = localStorage.getItem("token");

  if (!token) {
    token = await getToken();
    if (token) {
      localStorage.setItem("token", token);
    } else {
      return;
    }
  }

  fetchArtworks();
  fetchRecordings();
  updateRecordingTime();
});
