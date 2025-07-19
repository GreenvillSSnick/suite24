document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    // load content dynamically or highlight the active tab
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
  });
});

const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');
const img = new Image();
img.src = '/assets/panorama.jpg';

img.onload = () => {
  canvas.width = img.width;
  canvas.height = img.height;
  ctx.drawImage(img, 0, 0);
  ctx.font = '48px Share Tech';
  ctx.fillStyle = 'white';
  ctx.fillText('Welcome to 24Dash', 50, 100);
  const finalImage = canvas.toDataURL('image/png');
  // use finalImage as a src or download it
};