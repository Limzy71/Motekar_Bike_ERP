if (localStorage.getItem('userData')) {
    window.location.href = 'dashboard.html';
}

const togglePasswordBtn = document.getElementById('toggle-password') as HTMLButtonElement;
const passwordInput = document.getElementById('password-input') as HTMLInputElement;
const toggleIcon = document.getElementById('toggle-icon') as HTMLSpanElement;

togglePasswordBtn.addEventListener('click', () => {
    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        toggleIcon.textContent = 'visibility';
    } else {
        passwordInput.type = 'password';
        toggleIcon.textContent = 'visibility_off';
    }
});

const formLogin = document.getElementById('form-login') as HTMLFormElement;
const pesanError = document.getElementById('pesan-error') as HTMLDivElement;
const pesanErrorText = document.getElementById('pesan-error-text') as HTMLParagraphElement;
const btnSubmit = document.getElementById('btn-submit') as HTMLButtonElement;
const btnText = document.getElementById('btn-text') as HTMLSpanElement;
const btnLoader = document.getElementById('btn-loader') as HTMLSpanElement;
const appDiv = document.getElementById('app') as HTMLDivElement;

formLogin.addEventListener('submit', async (e) => {
    e.preventDefault();

    const usernameInputValue = (document.getElementById('username-input') as HTMLInputElement).value;
    const passwordInputValue = passwordInput.value;

    btnSubmit.disabled = true;
    btnSubmit.classList.add('opacity-80', 'cursor-wait');
    btnText.classList.add('invisible');
    btnLoader.classList.remove('hidden');
    pesanError.classList.add('hidden');
    pesanError.classList.remove('flex');

    try {
        const response = await fetch('http://127.0.0.1:5050/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username: usernameInputValue,
                password: passwordInputValue
            })
        });

        const result = await response.json();

        if (response.ok && result.status === 'success') {
            btnLoader.textContent = 'check_circle';
            btnLoader.classList.remove('animate-spin');

            localStorage.setItem('userData', JSON.stringify(result.user));

            // Redirect ke dashboard setelah animasi singkat
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 600);
        } else {
            pesanErrorText.innerText = result.message || "Gagal masuk ke sistem.";
            pesanError.classList.remove('hidden');
            pesanError.classList.add('flex');

            btnSubmit.disabled = false;
            btnSubmit.classList.remove('opacity-80', 'cursor-wait');
            btnText.classList.remove('invisible');
            btnLoader.classList.add('hidden');
        }
    } catch (error) {
        pesanErrorText.innerText = "Terjadi kesalahan koneksi ke server.";
        pesanError.classList.remove('hidden');
        pesanError.classList.add('flex');

        btnSubmit.disabled = false;
        btnSubmit.classList.remove('opacity-80', 'cursor-wait');
        btnText.classList.remove('invisible');
        btnLoader.classList.add('hidden');
    }
});