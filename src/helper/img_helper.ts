import type { StaticImageData } from 'next/image';
import jai_logo from '../../public/logo/jai-logo.png';
import security from '../../public/login/10221304.jpg';
import homeBackground from '../../public/home/homebg.jpeg';

const ImgHelper: Record<string, Record<string, StaticImageData>> = {
  logo: {
    jai_logo,
  },
  login: {
    security,
  },
  home: {
    background: homeBackground,
  },
};

export default ImgHelper;
