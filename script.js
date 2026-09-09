const menuButton = document.querySelector('.menu-button');
const navigation = document.querySelector('.nav');

menuButton.addEventListener('click', () => {
  const isOpen = menuButton.getAttribute('aria-expanded') === 'true';
  menuButton.setAttribute('aria-expanded', String(!isOpen));
  navigation.classList.toggle('is-open', !isOpen);
});

navigation.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => {
    menuButton.setAttribute('aria-expanded', 'false');
    navigation.classList.remove('is-open');
  });
});

document.querySelectorAll('.day-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.day-tab').forEach((item) => item.classList.remove('is-active'));
    document.querySelectorAll('.schedule').forEach((item) => item.classList.remove('is-active'));
    tab.classList.add('is-active');
    document.getElementById(tab.dataset.day).classList.add('is-active');
  });
});

document.querySelector('.to-top').addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver(
    (entries) => entries.forEach((entry) => entry.isIntersecting && entry.target.classList.add('is-visible')),
    { threshold: 0.08 }
  );
  document.querySelectorAll('.reveal').forEach((element) => observer.observe(element));
} else {
  document.querySelectorAll('.reveal').forEach((element) => element.classList.add('is-visible'));
}
