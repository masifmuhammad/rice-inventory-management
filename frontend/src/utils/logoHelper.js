/**
 * Helper function to load logo image for PDF generation
 * @returns {Promise<string>} Base64 encoded image or null
 */
export const loadLogoForPDF = async () => {
  try {
    // Try to load the logo from public folder (try JPG first, then PNG)
    let response = await fetch('/hm-logo.jpg');
    let imageType = 'JPEG';
    
    if (!response.ok) {
      // Try PNG
      response = await fetch('/hm-logo.png');
      if (!response.ok) {
        // Try JPEG
        response = await fetch('/hm-logo.jpeg');
        if (!response.ok) {
          console.warn('Logo file not found at /hm-logo.jpg, /hm-logo.png, or /hm-logo.jpeg');
          return null;
        }
      } else {
        imageType = 'PNG';
      }
    }
    
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        console.log('Logo loaded successfully, type:', imageType);
        resolve({ data: reader.result, type: imageType });
      };
      reader.onerror = (error) => {
        console.error('Error reading logo file:', error);
        resolve(null);
      };
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error('Error loading logo:', error);
    return null;
  }
};
