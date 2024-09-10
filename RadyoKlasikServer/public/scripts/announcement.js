document.addEventListener("DOMContentLoaded", () => {
  const currentAnnouncement = document.getElementById("currentAnnouncement");
  const newAnnouncement = document.getElementById("newAnnouncement");
  const statusMessage = document.getElementById("statusMessage");
  const token = localStorage.getItem("token"); // Get the token from localStorage

  // Fetch the current announcement
  fetch("/recording/announcement", {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`, // Add token to Authorization header
    },
  })
    .then((response) => response.json())
    .then((data) => {
      if (data.announcement) {
        currentAnnouncement.value = data.announcement;
      } else {
        currentAnnouncement.value = "No current announcement.";
      }
    })
    .catch((error) => {
      statusMessage.textContent = "Failed to fetch current announcement.";
    });

  // Handle the update announcement button click
  document
    .getElementById("updateAnnouncement")
    .addEventListener("click", () => {
      const updatedText = newAnnouncement.value.trim();

      if (!updatedText) {
        statusMessage.textContent = "Please enter the new announcement text.";
        return;
      }

      fetch("/recording/announcement", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`, // Add token to Authorization header
        },
        body: JSON.stringify({ announcement: updatedText }),
      })
        .then((response) => response.json())
        .then((data) => {
          if (data.message) {
            statusMessage.textContent = data.message;
            currentAnnouncement.value = updatedText; // Update the current announcement display
          } else {
            statusMessage.textContent = "Failed to update announcement.";
          }
        })
        .catch((error) => {
          statusMessage.textContent = "Error updating announcement.";
        });
    });

  // Back to Dashboard button logic
  document.getElementById("backToDashboard").addEventListener("click", () => {
    window.location.href = "/dashboard";
  });
});
