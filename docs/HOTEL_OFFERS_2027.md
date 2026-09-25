# CIRC 2027 accommodation offers

Participant-facing information supplied by the organisation on 25 September 2026, from its hotel partnership workbook (updated 15 September). The workbook records received offers and pending decisions, not closed official-hotel agreements. The website therefore describes these as received accommodation offers, with confirmation and availability caveats.

Seven hotels have booking instructions: D. Luís, Astória, Mondego, Vila Galé Coimbra, Tivoli Coimbra, NH Coimbra Dona Inês and Vitória. Quinta das Lágrimas is excluded while its booking code and agreement remain unresolved. Private speaker/organisation rates and negotiation contacts are not published.

Maintain the public data in `src/data/hotels2027.js`. Do not infer an NH discount percentage, Tivoli eligible dates, breakfast inclusion, tourist tax or cancellation terms where the source does not specify them. Tourist tax amounts for Astória and D. Luís are explicitly attributed to the received offers and must be confirmed with the hotel. Preserve Vila Galé's exclusion of non-refundable rates and the absence of a room block.

Bookings and payments are direct with hotels. Codes are visible and copyable, with manual-copy fallback. A displayed code does not mean its acceptance was independently tested in a hotel checkout. Official sites were checked for link destinations and public contact information; no booking was made.

The section is bilingual and accessible at `/coimbra#alojamento`. Conditions use keyboard-operable native disclosure panels. The page's anchor navigation must retain the header offset, including on direct entry.

## Hotel card images

Added 25 September 2026 from each hotel's official website/CDN. The source URLs below identify the property; no stock or generated hotel imagery is used. Tivoli uses the room image currently supplied on its official homepage. Room images illustrate the property and do not specify the room category included in an offer. Images are stored locally as WebP (maximum width 1200 px) and lazy-loaded with intrinsic dimensions; no external hotlink requests are needed.

| Local asset | Official image source |
| --- | --- |
| `public/hotels/hotel-d-luis.webp` | https://static-resources-elementor.mirai.com/wp-content/uploads/sites/1954/Foto-fachada-1-1024x768.webp |
| `public/hotels/hotel-astoria.webp` | https://www.almeidahotels.pt/media/uploads/cms_apps/imagenes/fachada-astoria-d.jpg?q=pr:sharp/rs:fill/w:1200/h:700/f:jpg |
| `public/hotels/hotel-mondego.webp` | https://hotelmondego.com/imagens/79.jpg |
| `public/hotels/vila-gale-coimbra.webp` | https://d2h50f2ee3zau3.cloudfront.net/app/uploads/2026/03/11162248/vg-coimbra_aerea_1_baixa.jpg |
| `public/hotels/nh-coimbra-dona-ines.webp` | https://img.nh-hotels.net/q83R6/gvYLXr/original/NH_Coimbra_Dona_Ines_Facade_Exterior.jpg?output-quality=80&resize=1200:* |
| `public/hotels/hotel-vitoria.webp` | https://hotelvitoria.pt/wp-content/uploads/2025/04/Hotel-vitoria-Quarto-duplo-20.webp |
| `public/hotels/tivoli-coimbra.webp` | https://assets.tivolihotels.com/image/upload/q_auto,f_auto,c_limit,w_1200/media/minor/tivoli/images/hotels/tcoi/new-images/homepage/tivoli_coimbra_homepage-banner_1920x900_room.jpg |

The Coimbra page is focused on accommodation, with a compact congress venue/date strip. Pre-congress course information and the historical 2025 accommodation/restaurant network have been removed from this page. The congress dates remain 9–10 April 2027.
