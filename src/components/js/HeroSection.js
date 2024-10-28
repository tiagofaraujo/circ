import React from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import 'swiper/css';
import 'swiper/css/pagination';
import 'swiper/css/navigation';
import 'swiper/css/effect-coverflow';
import { Pagination, Navigation, EffectCoverflow, Autoplay } from 'swiper/modules';
import '../css/HeroSection.css';

const slideImage1 = `${process.env.PUBLIC_URL}/img/related-post/related-post-1.jpg`;
const slideImage2 = `${process.env.PUBLIC_URL}/img/related-post/related-post-2.jpg`;
const slideImage3 = `${process.env.PUBLIC_URL}/img/related-post/related-post-3.jpg`;
const slideImage4 = `${process.env.PUBLIC_URL}/img/related-post/related-post-4.jpg`;

function HeroSection() {
    return (
        <section className="hero-section">
            <Swiper
                effect="coverflow"
                grabCursor={true}
                centeredSlides={true}
                slidesPerView="auto"
                coverflowEffect={{
                    rotate: 50,
                    stretch: 0,
                    depth: 100,
                    modifier: 1,
                    slideShadows: true,
                }}
                pagination={{ clickable: true }}
                navigation={true}
                autoplay={{
                    delay: 3000, // Delay between transitions (in milliseconds)
                    disableOnInteraction: false, // Continue autoplay after user interactions
                }}
                modules={[Pagination, Navigation, EffectCoverflow, Autoplay]}
                className="mySwiper"
            >
                <SwiperSlide>
                       <div className="slide-content">
                        <img src={slideImage2} alt="Slide 2" className="slide-image" />
                        <div className="text-overlay">
                            <h4>Submissão de Trabalhos</h4>
                        </div>
                    </div>
                </SwiperSlide>

                <SwiperSlide>
                    <div className="slide-content">
                        <img src={slideImage1} alt="Slide 1" className="slide-image" />
                        <div className="text-overlay">
                            <h4>Medical Exhibition</h4>
                        </div>
                    </div>
                </SwiperSlide>
                <SwiperSlide>
                    <div className="slide-content">
                        <img src={slideImage4} alt="Slide 4" className="slide-image" />
                        <div className="text-overlay">
                            <h4>Programa Oficial 2025</h4>
                        </div>
                    </div>
                </SwiperSlide>
                <SwiperSlide>
                    <div className="slide-content">
                        <img src={slideImage3} alt="Slide 3" className="slide-image" />
                        <div className="text-overlay">
                            <h4>O Conceito</h4>
                        </div>
                    </div>
                </SwiperSlide>
            
         

            </Swiper>
        </section>
    );
}

export default HeroSection;