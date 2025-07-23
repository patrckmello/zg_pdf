document.addEventListener("DOMContentLoaded", function() {
    const form = document.getElementById("feedback-form");
    const popup = document.getElementById("form-popup");
    const submitBtn = form.querySelector('button[type="submit"]');

    form.addEventListener("submit", function (e) {
        e.preventDefault(); // evita o comportamento padrão (recarregar página)

        submitBtn.disabled = true;
        submitBtn.textContent = "Enviando...";

        const formData = new FormData(form);

        fetch(form.action, {
            method: "POST",
            body: formData
        })
        .then(response => {
            if (!response.ok) throw new Error("Erro ao enviar feedback");
            return response.text(); // ou json(), se backend retornar JSON
        })
        .then(() => {
            popup.classList.remove("hidden");
            popup.classList.add("show");
            
            // Limpa o form, se quiser
            form.reset();

            setTimeout(() => {
                popup.classList.remove("show");
                popup.classList.add("hidden");

                submitBtn.disabled = false;
                submitBtn.textContent = "Enviar";
            }, 4000);
        })
        .catch(err => {
            alert("Erro ao enviar feedback, tente novamente.");
            console.error(err);

            submitBtn.disabled = false;
            submitBtn.textContent = "Enviar";
        });
    });

    // --- REINTRODUZIR: Animações de Revelação de SEÇÕES (com IntersectionObserver) ---
    // Isso é o que adiciona a classe 'show-section' às suas <section>s
    const sections = document.querySelectorAll("section");
    const sectionObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add("show-section");
            } else {
                // Opcional: Se quiser que a animação resete ao sair da tela
                // entry.target.classList.remove("show-section");
            }
        });
    }, {
        threshold: 0.1 // Porcentagem da seção visível para disparar
    });

    sections.forEach(section => {
        // Adiciona hidden-section a todas as seções para que comecem ocultas
        section.classList.add("hidden-section");
        sectionObserver.observe(section);
    });


    // --- Sticky Header com Animação ---
    const header = document.querySelector('header');
    const scrollThreshold = 50;

    window.addEventListener('scroll', () => {
        if (window.scrollY > scrollThreshold) {
            header.classList.add('header-scrolled');
        } else {
            header.classList.remove('header-scrolled');
        }
    });


    // --- Scroll-triggered animations com ScrollReveal.js ---
    // Inicializa o ScrollReveal

    ScrollReveal().reveal('.slogan .text h2', {
        delay: 400,
        distance: '50px',
        origin: 'bottom',
        opacity: 0,
        easing: 'ease-in-out',
        duration: 800,
        reset: false
    });

    ScrollReveal().reveal('.main-img', {
        delay: 600,
        distance: '80px',
        origin: 'right',
        opacity: 0,
        easing: 'ease-in-out',
        duration: 900,
        reset: false
    });

    ScrollReveal().reveal('#tools h1', {
        delay: 200,
        distance: '30px',
        origin: 'top',
        opacity: 0,
        easing: 'ease-in-out',
        duration: 700,
        reset: false
    });

    ScrollReveal().reveal('.tool', {
        delay: 300,
        interval: 100, // Atraso entre cada elemento .tool
        distance: '30px',
        origin: 'bottom',
        opacity: 0,
        easing: 'ease-in-out',
        duration: 800,
        reset: false
    });

    ScrollReveal().reveal('#benefits h1', {
        delay: 200,
        distance: '40px',
        origin: 'left',
        opacity: 0,
        easing: 'ease-in-out',
        duration: 800,
        reset: false
    });

    ScrollReveal().reveal('.benefit', {
        delay: 300,
        interval: 150,
        distance: '40px',
        origin: 'bottom',
        opacity: 0,
        easing: 'ease-in-out',
        duration: 800,
        reset: false
    });

    ScrollReveal().reveal('#forms .content-left h1', {
        delay: 200,
        distance: '30px',
        origin: 'top',
        opacity: 0,
        easing: 'ease-in-out',
        duration: 700,
        reset: false
    });

    ScrollReveal().reveal('#forms .content-left h2', {
        delay: 300,
        distance: '30px',
        origin: 'top',
        opacity: 0,
        easing: 'ease-in-out',
        duration: 700,
        reset: false
    });

    ScrollReveal().reveal('#feedback-form label, #feedback-form input, #feedback-form select, #feedback-form textarea, #feedback-form button', {
        delay: 400,
        interval: 80, // Anima cada elemento do formulário com um pequeno intervalo
        distance: '20px',
        origin: 'left',
        opacity: 0,
        easing: 'ease-in-out',
        duration: 600,
        reset: false
    });

    ScrollReveal().reveal('.form-image', {
        delay: 500,
        distance: '50px',
        origin: 'right',
        opacity: 0,
        easing: 'ease-in-out',
        duration: 900,
        reset: false
    });

});