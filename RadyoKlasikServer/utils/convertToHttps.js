function convertToHttps(url) {
  if (!url) {
    throw new Error("URL is required");
  }
  const parsedUrl = new URL(url);
  parsedUrl.protocol = "https";
  return parsedUrl.toString();
}

module.exports = convertToHttps;
