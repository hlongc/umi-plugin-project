import test from '@/assets/111111.jpeg!webp';
import cat from '@/assets/cat111.jpg';
import Guide from '@/components/Guide';
import { ImageWebp } from '@/components/ImageWebp';
import { trim } from '@/utils/format';
import { PageContainer } from '@ant-design/pro-components';
import { useModel } from '@umijs/max';
import styles from './index.less';

const HomePage: React.FC = () => {
  const { name } = useModel('global');
  console.log(cat, test);
  return (
    <PageContainer ghost>
      <div className={styles.container}>
        <Guide name={trim(name)} />
        {/* <ImageWebp src={require('@/assets/cat111.jpg')} height={200} /> */}
        {/* <ImageWebp src={require('@/assets/111111.jpeg')} height={200} /> */}
        <ImageWebp src="/tmp.jpeg" height={200} />
        <ImageWebp src={require('./zhengshu.png')} height={200} />
        <ImageWebp src={require('../../star.jpeg')} height={200} />
        <div className={styles['bg-img']}>哈哈哈</div>
        <div className={styles['test-div']}></div>
      </div>
    </PageContainer>
  );
};

export default HomePage;
