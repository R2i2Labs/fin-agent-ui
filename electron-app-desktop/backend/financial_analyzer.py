import numpy as np
import pandas as pd

class FinancialAnalyzer:
    """Simple interface for AI to perform statistical operations on financial data"""
    
    @staticmethod
    def load_data(filepath):
        """Load CSV data into a numpy array.
        
        Args:
            filepath (str): Path to the CSV file
            
        Returns:
            DataFrame: Pandas DataFrame containing the data
        """
        return pd.read_csv(filepath)
    
    @staticmethod
    def calculate_mean(data):
        """Calculate arithmetic mean of the data.
        
        Args:
            data (array-like): Numerical data
            
        Returns:
            float: Mean value
        """
        return float(np.mean(data))
    
    @staticmethod
    def calculate_variance(data):
        """Calculate variance of the data.
        
        Args:
            data (array-like): Numerical data
            
        Returns:
            float: Variance
        """
        return float(np.var(data))
    
    @staticmethod
    def calculate_covariance(data1, data2):
        """Calculate covariance between two datasets.
        
        Args:
            data1 (array-like): First dataset
            data2 (array-like): Second dataset
            
        Returns:
            float: Covariance value
        """
        return float(np.cov(data1, data2)[0, 1])
    
    @staticmethod
    def calculate_correlation(data1, data2):
        """Calculate Pearson correlation coefficient.
        
        Args:
            data1 (array-like): First dataset
            data2 (array-like): Second dataset
            
        Returns:
            float: Correlation coefficient (-1 to 1)
        """
        return float(np.corrcoef(data1, data2)[0, 1])
    
    @staticmethod
    def calculate_stddev(data):
        """Calculate standard deviation.
        
        Args:
            data (array-like): Numerical data
            
        Returns:
            float: Standard deviation
        """
        return float(np.std(data))
    
    @staticmethod
    def calculate_percentile(data, percentile):
        """Calculate specific percentile of the data.
        
        Args:
            data (array-like): Numerical data
            percentile (float): Percentile value (0-100)
            
        Returns:
            float: Value at specified percentile
        """
        return float(np.percentile(data, percentile))
    
    @staticmethod
    def calculate_returns(prices):
        """Calculate simple returns from price series.
        
        Args:
            prices (array-like): Time series of prices
            
        Returns:
            array: Series of returns
        """
        return np.diff(prices) / prices[:-1]
    
    @staticmethod
    def calculate_log_returns(prices):
        """Calculate logarithmic returns from price series.
        
        Args:
            prices (array-like): Time series of prices
            
        Returns:
            array: Series of log returns
        """
        return np.diff(np.log(prices))