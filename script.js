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

const observer = new IntersectionObserver(
  (entries) => entries.forEach((entry) => entry.isIntersecting && entry.target.classList.add('is-visible')),
  { threshold: 0.08 }
);

document.querySelectorAll('.reveal').forEach((element) => observer.observe(element));

const registrationForm = document.querySelector('#registration-form');
const formTarget = document.querySelector('.form-target');
let formSubmitted = false;

registrationForm.addEventListener('submit', () => {
  formSubmitted = true;
  const submitButton = registrationForm.querySelector('.form-submit');
  submitButton.disabled = true;
  submitButton.firstChild.textContent = 'Отправляем… ';
});

formTarget.addEventListener('load', () => {
  if (!formSubmitted) return;
  registrationForm.reset();
  registrationForm.classList.add('is-sent');
  const submitButton = registrationForm.querySelector('.form-submit');
  submitButton.disabled = false;
  submitButton.firstChild.textContent = 'Отправить ещё раз ';
  formSubmitted = false;
});
