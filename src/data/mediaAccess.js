import media from './mediaCenter.json';
export const mediaPreview = process.env.REACT_APP_MEDIA_PREVIEW === 'true';
export const mediaVisible = media.published || mediaPreview;
